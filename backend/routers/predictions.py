import io
import logging
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException
from statsmodels.tsa.statespace.sarimax import SARIMAXResults

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/predictions", tags=["predictions"])

# ── Expected feature columns ───────────────────────────────────────────────────

EXPECTED_COLUMNS = ["sales_diff"] + [f"lag_{i}" for i in range(1, 13)]  # 13 columns total

# ── Load all models once at startup ───────────────────────────────────────────

ML_DIR = Path(__file__).parent.parent / "ml"

try:
    scaler         = joblib.load(ML_DIR / "scaler.pkl")
    reference_data = joblib.load(ML_DIR / "reference_data.pkl")
    logger.info("Scaler and reference data loaded successfully.")
except Exception as e:
    logger.critical(f"Failed to load scaler or reference data: {e}")
    raise RuntimeError(f"Could not load scaler/reference_data from {ML_DIR}: {e}")

models = {}
_model_files = {
    "LinearRegression": ("model_lr.pkl",      "joblib"),
    "RandomForest":     ("model_rf.pkl",      "joblib"),
    "XGBoost":          ("model_xgb.pkl",     "joblib"),
    "SARIMAX":          ("model_sarimax.pkl", "sarimax"),
}

for name, (filename, loader) in _model_files.items():
    try:
        path = ML_DIR / filename
        models[name] = SARIMAXResults.load(path) if loader == "sarimax" else joblib.load(path)
        logger.info(f"Model '{name}' loaded from {path}")
    except Exception as e:
        logger.critical(f"Failed to load model '{name}' from {ML_DIR / filename}: {e}")
        raise RuntimeError(f"Could not load model '{name}': {e}")

# ── Helpers ───────────────────────────────────────────────────────────────────

def unscale(y_pred_scaled: np.ndarray, X_test_scaled: np.ndarray) -> np.ndarray:
    """Undo MinMax scaling on predictions."""
    y = y_pred_scaled.reshape(-1, 1, 1)
    x = X_test_scaled.reshape(X_test_scaled.shape[0], 1, X_test_scaled.shape[1])
    combined = np.array([
        np.concatenate([y[i], x[i]], axis=1) for i in range(len(y))
    ]).reshape(len(y), -1)
    return scaler.inverse_transform(combined)


def build_predictions(unscaled: np.ndarray) -> list[dict]:
    """Undo differencing and build response list."""
    dates     = reference_data["dates"]         # 13 months
    act_sales = reference_data["actual_sales"]  # 13 months

    result = []
    for i in range(len(unscaled)):
        predicted = int(round(unscaled[i][0] + act_sales[i]))  # round before int cast
        result.append({
            "date":            dates[i + 1],
            "predicted_sales": predicted,
            "actual_sales":    act_sales[i + 1],
        })
    return result


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/predict")
async def predict(
    model_name: str,
    file: UploadFile = File(...),
):
    """
    Accepts a test CSV and a model name, returns predicted vs actual sales.

    model_name: one of LinearRegression, RandomForest, XGBoost, SARIMAX
    file: test.csv with columns: date, sales, sales_diff, lag_1 ... lag_12
    """
    if model_name not in models:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown model '{model_name}'. Choose from: {list(models.keys())}"
        )

    # Parse uploaded CSV
    content = await file.read()
    try:
        test_df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {e}")

    # Validate row count — must be 12 rows
    if len(test_df) != 12:
        raise HTTPException(
            status_code=400,
            detail=f"Expected 12 rows (monthly test data), got {len(test_df)}"
        )

    # Validate columns
    missing_cols = set(EXPECTED_COLUMNS) - set(test_df.columns)
    if missing_cols:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns: {sorted(missing_cols)}"
        )

    # Drop non-feature columns and scale
    try:
        X_test_raw    = test_df.drop(columns=["sales", "date"], errors="ignore").values
        X_test_scaled = scaler.transform(X_test_raw)
        X_test_features = X_test_scaled[:, 1:]  # drop sales_diff column (target)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Feature extraction failed: {e}")

    # Run inference
    model = models[model_name]

    if model_name == "SARIMAX":
        # start=40, end=51 are derived from training set size (40 obs) + 12-step forecast
        # dynamic=7 means forecast goes dynamic after the 7th in-sample step
        start, end, dynamic = 40, 51, 7
        preds_diff = model.predict(start=start, end=end, dynamic=dynamic).values[-12:]
        dates     = reference_data["dates"]
        act_sales = reference_data["actual_sales"]
        result = [
            {
                "date":            dates[i + 1],
                "predicted_sales": int(round(preds_diff[i] + act_sales[i])),  # round before int cast
                "actual_sales":    act_sales[i + 1],
            }
            for i in range(12)
        ]
    else:
        preds_scaled = model.predict(X_test_features)
        unscaled     = unscale(preds_scaled, X_test_features)
        result       = build_predictions(unscaled)

    # Compute scores
    actual    = np.array([r["actual_sales"]    for r in result])
    predicted = np.array([r["predicted_sales"] for r in result])
    rmse = float(np.sqrt(np.mean((actual - predicted) ** 2)))
    mae  = float(np.mean(np.abs(actual - predicted)))

    return {
        "model":       model_name,
        "predictions": result,
        "scores": {
            "rmse": round(rmse, 2),
            "mae":  round(mae, 2),
        }
    }