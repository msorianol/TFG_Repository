using System.Collections.Generic;
using UnityEngine;
using R3;

namespace Features.Enemies
{
    public class EnemiesModel
    {
        private readonly List<GameObject> _aliveEnemies = new();
        public IReadOnlyList<GameObject> AliveEnemies => _aliveEnemies;
        
        public Subject<int> OnAliveEnemiesChanged { get; } = new();
        public Subject<int> OnEnemyKilled { get; } = new();
        
        public void AddEnemy(GameObject enemy)
        {
            if (enemy == null || _aliveEnemies.Contains(enemy))
            {
                return;
            }

            _aliveEnemies.Add(enemy);
            OnAliveEnemiesChanged.OnNext(_aliveEnemies.Count);
        }

        public void RemoveEnemy(GameObject enemy)
        {
            if (enemy == null)
            {
                return;
            }

            _aliveEnemies.Remove(enemy);
            OnAliveEnemiesChanged.OnNext(_aliveEnemies.Count);
        }

        public List<GameObject> GetAliveEnemiesSnapshot()
        {
            _aliveEnemies.RemoveAll(enemy => enemy == null);
            return new List<GameObject>(_aliveEnemies);
        }
    }
}
