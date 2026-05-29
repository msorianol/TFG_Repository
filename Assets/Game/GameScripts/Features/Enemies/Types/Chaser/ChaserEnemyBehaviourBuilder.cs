using Core;
using Features.Enemies.Types;
using Features.Player;
using UnityEngine;

namespace Features.Enemies.Types.Chaser
{
    public class ChaserEnemyBehaviourBuilder : IEnemyBehaviourBuilder
    {
        private readonly PlayerModel _playerModel;
        private readonly IUpdateLoop _updateLoop;

        public EnemyType EnemyType => EnemyType.Chaser;

        public ChaserEnemyBehaviourBuilder(PlayerModel playerModel, IUpdateLoop updateLoop)
        {
            _playerModel = playerModel;
            _updateLoop = updateLoop;
        }

        public IEnemyBehaviour Build(EnemyDataSO data, GameObject enemyInstance, EnemiesModel enemiesModel,
            PlayerView playerView)
        {
            var chaserEnemyView = enemyInstance.GetComponent<ChaserEnemyView>();
            if (chaserEnemyView == null)
            {
                Debug.LogError(
                    $"Enemy '{data.EnemyName}' expects '{nameof(ChaserEnemyView)}' on prefab '{enemyInstance.name}'.");
                return null;
            }

            if (enemyInstance.GetComponent<Rigidbody>() == null)
            {
                Debug.LogError(
                    $"Enemy '{data.EnemyName}' expects a '{nameof(Rigidbody)}' on prefab '{enemyInstance.name}'.");
                return null;
            }

            chaserEnemyView.Initialize(enemiesModel);
            return new ChaserEnemyController(chaserEnemyView, _playerModel, playerView, data.EnemySpeed, _updateLoop);
        }
    }
}
