using Core;
using Features.Enemies.Types;
using Features.Player;
using UnityEngine;

namespace Features.Enemies
{
    public interface IEnemyBehaviourBuilder
    {
        EnemyType EnemyType { get; }

        IEnemyBehaviour Build(EnemyDataSO data, GameObject enemyInstance, EnemiesModel enemiesModel,
            PlayerView playerView);
    }
}
