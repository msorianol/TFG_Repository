using UnityEngine;

namespace Features.Enemies
{
    public class EnemySpawnerView : MonoBehaviour
    {
        public GameObject CreateEnemy(EnemyDataSO data, Vector3 position)
        {
            if (data.EnemyPrefab == null)
            {
                return null;
            }

            GameObject enemyInstance = Instantiate(data.EnemyPrefab, position, Quaternion.identity);
            enemyInstance.name = data.EnemyName;

            return enemyInstance;
        }
    }
}