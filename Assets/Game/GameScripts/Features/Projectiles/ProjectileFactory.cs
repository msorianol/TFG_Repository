using UnityEngine;

namespace Features.Projectiles
{
    public class ProjectileFactory
    {
        private ProjectileView _projectilePrefab;

        public ProjectileFactory(ProjectileView prefab)
        {
            _projectilePrefab = prefab;
        }
        
        public void SetPrefab(ProjectileView newPrefab)
        {
            _projectilePrefab = newPrefab;
        }

        public void Create(Vector3 position, Quaternion direction, float damage)
        {
            var instance = Object.Instantiate(_projectilePrefab, position, direction);
            instance.GetComponent<ProjectileView>()?.Initialize(damage);
        }
    }
}