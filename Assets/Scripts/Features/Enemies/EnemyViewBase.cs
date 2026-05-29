using UnityEngine;

namespace Features.Enemies
{
    public abstract class EnemyViewBase : MonoBehaviour
    {
        [Header("Enemy Config")]
        [SerializeField] protected EnemyDataSO _enemyConfig;
        
        protected EnemiesModel _enemiesModel;
        protected float _currentHealth;

        public virtual void Initialize(EnemiesModel enemiesModel)
        {
            _enemiesModel = enemiesModel;
            _currentHealth = _enemyConfig.EnemyHealth;
        }

        public virtual void TakeDamage(float damage)
        {
            _currentHealth -= damage;
            
            if (_currentHealth <= 0)
            {
                OnDie();
            }
        }

        protected virtual void OnDie()
        {
            _enemiesModel?.RemoveEnemy(gameObject);
            _enemiesModel?.OnEnemyKilled.OnNext(_enemyConfig.XPToGive);
            Destroy(gameObject);
        }

        protected virtual void OnDestroy()
        {
            _enemiesModel?.RemoveEnemy(gameObject);
        }
    }
}