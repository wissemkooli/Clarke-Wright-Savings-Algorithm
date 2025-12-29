import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split
from datetime import datetime, timedelta

# ==========================================
# 1. GÉNÉRATION DE DONNÉES DE TEST
# ==========================================
def creer_donnees_simulees():
    np.random.seed(42)
    # On simule un historique de 1000 commandes
    data = pd.DataFrame({
        'mois': np.random.randint(1, 13, 1000),
        'jour_semaine': np.random.randint(0, 7, 1000),
        'derniere_commande_jours': np.random.randint(5, 45, 1000),
        'montant_moyen': np.random.uniform(50, 500, 1000)
    })
    # La cible : le nombre de jours avant la commande suivante
    # On crée une règle logique : plus l'achat est cher, plus le délai est long
    data['target_jours'] = data['derniere_commande_jours'] + (data['montant_moyen'] / 50) + np.random.normal(0, 2, 1000)
    return data

# ==========================================
# 2. ENTRAÎNEMENT DU MODÈLE XGBOOST
# ==========================================
def main():
    print("--- Préparation des données avec XGBoost ---")
    df = creer_donnees_simulees()
    
    # Choix des caractéristiques (Features)
    X = df[['mois', 'jour_semaine', 'derniere_commande_jours', 'montant_moyen']]
    y = df['target_jours']

    # Division pour tester l'IA
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    # Configuration du modèle XGBoost
    # On utilise 'reg:squarederror' pour prédire une valeur numérique (délai)
    model = xgb.XGBRegressor(
        n_estimators=100,
        learning_rate=0.1,
        max_depth=5,
        objective='reg:squarederror'
    )

    print("--- Entraînement en cours... ---")
    model.fit(X_train, y_train)

    # ==========================================
    # 3. TEST DE PRÉDICTION RÉEL
    # ==========================================
    # Imaginons un client aujourd'hui :
    # Nous sommes en Décembre (12), Mercredi (2), 
    # son dernier achat remonte à 15 jours, pour 250€
    nouveau_client = pd.DataFrame([[12, 2, 15, 250]], 
                                 columns=['mois', 'jour_semaine', 'derniere_commande_jours', 'montant_moyen'])
    
    delai_predit = model.predict(nouveau_client)[0]
    
    # Calcul de la date exacte
    date_dernier_achat = datetime.now()
    date_prochaine_commande = date_dernier_achat + timedelta(days=int(delai_predit))

    print("\n" + "="*50)
    print("RÉSULTAT DE LA PRÉDICTION XGBOOST")
    print(f"Nombre de jours estimé : {delai_predit:.1f} jours")
    print(f"Date prévue de la commande : {date_prochaine_commande.strftime('%A %d %B %Y')}")
    print("="*50)

if __name__ == "__main__":
    main()

#Note:c'est le code pour prédir les nombres des commandes avec XGBoost
import pandas as pd
import numpy as np
import xgboost as xgb
import matplotlib.pyplot as plt
from sklearn.metrics import mean_absolute_error, mean_squared_error

# 1. CRÉATION D'UN JEU DE DONNÉES FICTIF (Pour l'exemple)
np.random.seed(42)
dates = pd.date_range(start='2022-01-01', end='2023-12-31', freq='D')
data = pd.DataFrame({'date': dates})
# Simulation d'une tendance, d'une saisonnalité hebdomadaire et de bruit
data['nb_commandes'] = (np.arange(len(dates)) * 0.05 + 
                        (data['date'].dt.dayofweek * 10) + 
                        np.random.normal(0, 5, len(dates)) + 50).astype(int)

# 2. FEATURE ENGINEERING (L'étape la plus importante)
def create_features(df):
    df = df.copy()
    df['dayofweek'] = df['date'].dt.dayofweek
    df['quarter'] = df['date'].dt.quarter
    df['month'] = df['date'].dt.month
    df['year'] = df['date'].dt.year
    df['dayofyear'] = df['date'].dt.dayofyear
    
    # Création de variables de retard (Lag features)
    # On regarde ce qu'il s'est passé il y a 7 jours et 14 jours
    df['lag_7'] = df['nb_commandes'].shift(7)
    df['lag_14'] = df['nb_commandes'].shift(14)
    
    # Moyenne glissante sur 7 jours (pour capter la tendance récente)
    df['rolling_mean_7'] = df['nb_commandes'].shift(1).rolling(window=7).mean()
    
    return df

df_features = create_features(data).dropna()

# 3. SÉPARATION TRAIN / TEST (Chronologique)
# On ne mélange pas les données (pas de shuffle) pour respecter le temps
train = df_features[df_features['date'] < '2023-10-01']
test = df_features[df_features['date'] >= '2023-10-01']

features = ['dayofweek', 'quarter', 'month', 'year', 'dayofyear', 'lag_7', 'lag_14', 'rolling_mean_7']
target = 'nb_commandes'

X_train, y_train = train[features], train[target]
X_test, y_test = test[features], test[target]

# 4. ENTRAÎNEMENT DU MODÈLE XGBOOST
model = xgb.XGBRegressor(
    n_estimators=1000,
    learning_rate=0.01, # Un petit taux pour plus de précision
    max_depth=5,
    early_stopping_rounds=50,
    objective='reg:squarederror'
)

model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=100)

# 5. PRÉDICTIONS ET ÉVALUATION
predictions = model.predict(X_test)
mae = mean_absolute_error(y_test, predictions)

print(f"\nErreur Moyenne Absolue (MAE) : {mae:.2f} commandes")
#Note:c'est le code pour faire l'optimisation en utilisant l'algorithme de clarke and wright
import math

def calculer_distance(p1, p2):
    return math.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)

def optimiser_remplacement(depot, tournee, ancienne_cmd, nouvelle_cmd):
    # 1. On retire l'ancienne commande de la liste
    if ancienne_cmd in tournee:
        tournee_nettoyee = [p for p in tournee if p != ancienne_cmd]
        print(f"Retrait de l'ancienne commande : {ancienne_cmd}")
    else:
        print("L'ancienne commande n'est pas dans la tournée.")
        return tournee

    # 2. Logique Clarke & Wright : Trouver la meilleure position d'insertion
    # On cherche l'endroit qui minimise l'augmentation de distance
    best_cost = float('inf')
    best_index = -1
    
    # On ajoute le dépôt au début et à la fin pour simuler le trajet complet
    route_complete = [depot] + tournee_nettoyee + [depot]
    
    for i in range(len(route_complete) - 1):
        p_A = route_complete[i]
        p_B = route_complete[i+1]
        
        # Coût d'insertion = (Dist A vers Nouveau + Dist Nouveau vers B) - Dist A vers B
        cout = calculer_distance(p_A, nouvelle_cmd) + \
               calculer_distance(nouvelle_cmd, p_B) - \
               calculer_distance(p_A, p_B)
        
        if cout < best_cost:
            best_cost = cout
            best_index = i

    # 3. Insertion de la nouvelle commande à la position optimale
    tournee_optimisee = tournee_nettoyee.copy()
    tournee_optimisee.insert(best_index, nouvelle_cmd)
    
    return tournee_optimisee, best_cost

# --- TEST DU CODE ---
depot_coord = (0, 0)
ma_tournee = [(1, 2), (5, 5), (8, 2)] # Mes livraisons prévues
ancienne = (5, 5) # Le client qui annule
nouvelle = (4, 4) # Le nouveau client qui commande

nouvelle_route, surcout = optimiser_remplacement(depot_coord, ma_tournee, ancienne, nouvelle)

print(f"\nNouvelle tournée optimisée : {nouvelle_route}")
print(f"Efficacité : La nouvelle route coûte seulement {surcout:.2f} km de plus que la route sans la commande annulée.")

