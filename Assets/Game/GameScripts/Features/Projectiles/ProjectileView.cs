using Features.Enemies.Types;
using Features.Enemies.Types.Chaser;
using UnityEngine;

namespace Features.Projectiles
{
    public class ProjectileView : MonoBehaviour
    {
        [Header("Projectile Settings")]
        [SerializeField] private float _baseSpeed;
        [SerializeField] private float _lifetime = 5f;
        
        private float _damage;
        
        public void Initialize(float damage)
        {
            _damage = damage;
            Destroy(gameObject, _lifetime);
        }

        private void Update()
        {
            transform.position += transform.forward * (_baseSpeed * Time.deltaTime);
        }
        
        private void OnTriggerEnter(Collider other)
        {
            if (other.CompareTag("Enemy"))
            {
                other.GetComponent<ChaserEnemyView>()?.TakeDamage(_damage);
                Destroy(gameObject);
            }
            else if (other.CompareTag("Wall"))
            {
                Destroy(gameObject);
            }
        }
    }
}