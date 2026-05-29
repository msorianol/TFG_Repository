using UnityEngine;
using R3;
using Features.Enemies;

namespace Features.Levels.Levels
{
    public class LevelModel
    {
        public ReactiveProperty<GameObject> CurrentLevel { get; private set; } = new();
        public ReactiveProperty<LevelState> RoomState { get; } = new();
        public ReactiveProperty<EnemySpawnPoint[]> SpawnPoints { get; } = new(null);
    }
}