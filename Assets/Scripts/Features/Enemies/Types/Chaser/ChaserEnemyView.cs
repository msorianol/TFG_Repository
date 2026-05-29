using R3;
using UnityEngine;

namespace Features.Enemies.Types.Chaser
{
    public class ChaserEnemyView : EnemyViewBase
    {
        private Rigidbody _rb;
        private float _damage;

        private readonly Subject<float> _onPlayerHit = new();
        public Observable<float> OnPlayerHit => _onPlayerHit;

        private void Awake()
        {
            _rb = GetComponent<Rigidbody>();
        }

        public override void Initialize(EnemiesModel enemiesModel)
        {
            base.Initialize(enemiesModel);
            _damage = _enemyConfig.EnemyDamage;
        }

        public void Move(Vector3 direction, float speed)
        {
            _rb.MovePosition(_rb.position + direction * (speed * Time.deltaTime));
        }

        /* If I want to do something different when this specific enemy dies:
        protected override void Die()
        {
            // Here we put the specific things to do -->
            Instantiate(ExplosionPrefab, transform.position, Quaternion.identity);
            DealAreaDamage();

            // Then we call the base Die()
            base.Die();
        } */
        
        private void OnTriggerEnter(Collider other)
        {
            if (other.CompareTag("Player"))
            {
                _onPlayerHit.OnNext(_damage);
            }
        }
    }
}