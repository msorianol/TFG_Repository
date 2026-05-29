using UnityEngine;
using Features.Enemies.Types;

namespace Features.Enemies
{
    [CreateAssetMenu(fileName = "NewEnemy", menuName = "Game/Enemy Data")]
    public class EnemyDataSO : ScriptableObject
    {
        public string EnemyName;
        public GameObject EnemyPrefab;
        public float EnemyHealth;
        public float EnemyDamage;
        public float EnemySpeed;
        public EnemyType EnemyType;
        public int XPToGive;
    }
}