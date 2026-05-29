using Core;
using Features.Player;
using Features.Enemies.Types;
using Features.Enemies.Types.Chaser;
using System.Collections.Generic;
using UnityEngine;

namespace Features.Enemies
{
    public class EnemyBehaviourFactory
    {
        private readonly EnemySpawnerView _enemySpawnerView;
        private readonly Dictionary<EnemyType, IEnemyBehaviourBuilder> _behaviourBuilders;

        public EnemyBehaviourFactory(PlayerModel playerModel, EnemySpawnerView enemySpawnerView, IUpdateLoop updateLoop)
        {
            _enemySpawnerView = enemySpawnerView;
            _behaviourBuilders = RegisterBuilders(new IEnemyBehaviourBuilder[]
            {
                new ChaserEnemyBehaviourBuilder(playerModel, updateLoop)
            });
        }

        public IEnemyBehaviour Create(EnemyDataSO data, Vector3 position, EnemiesModel enemiesModel,
            PlayerView playerView)
        {
            if (data == null)
            {
                Debug.LogError("Cannot create enemy behavior: EnemyDataSO is null.");
                return null;
            }

            if (enemiesModel == null || playerView == null)
            {
                Debug.LogError($"Cannot create behavior for enemy '{data.EnemyName}': model or player view is null.");
                return null;
            }

            if (data.EnemyPrefab == null)
            {
                Debug.LogError($"Cannot create enemy behavior for '{data.EnemyName}': prefab is not assigned.");
                return null;
            }

            if (!_behaviourBuilders.TryGetValue(data.EnemyType, out var builder))
            {
                Debug.LogError($"No enemy behavior builder registered for enemy type '{data.EnemyType}'.");
                return null;
            }

            GameObject newEnemy = _enemySpawnerView.CreateEnemy(data, position);
            if (newEnemy == null)
            {
                Debug.LogError($"Enemy '{data.EnemyName}' could not be instantiated.");
                return null;
            }

            IEnemyBehaviour behaviour = builder.Build(data, newEnemy, enemiesModel, playerView);
            if (behaviour == null)
            {
                Debug.LogError($"Enemy '{data.EnemyName}' was spawned but no behavior could be built.");
                UnityEngine.Object.Destroy(newEnemy);
                return null;
            }

            enemiesModel.AddEnemy(newEnemy);
            return behaviour;
        }

        private static Dictionary<EnemyType, IEnemyBehaviourBuilder> RegisterBuilders(
            IEnumerable<IEnemyBehaviourBuilder> builders)
        {
            var registry = new Dictionary<EnemyType, IEnemyBehaviourBuilder>();

            foreach (var builder in builders)
            {
                registry[builder.EnemyType] = builder;
            }

            return registry;
        }
    }
}
