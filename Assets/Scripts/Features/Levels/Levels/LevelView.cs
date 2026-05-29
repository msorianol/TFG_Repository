using UnityEngine;
using R3;
using Features.Enemies;

namespace Features.Levels.Levels
{
    public class LevelView : MonoBehaviour
    {
        private readonly SerialDisposable _triggerDisposable = new();
        
        private readonly Subject<Unit> _onTriggerEntered = new();
        public Observable<Unit> OnTriggerEntered => _onTriggerEntered;
        
        private readonly Subject<Vector3> _onSpawnPositionFound = new();
        public Observable<Vector3> OnSpawnPositionFound => _onSpawnPositionFound;

        private readonly Subject<EnemySpawnPoint[]> _onEnemySpawnPointsFound = new();
        public Observable<EnemySpawnPoint[]> OnEnemySpawnPointsFound => _onEnemySpawnPointsFound;

        private GameObject _currentLevelInstance;
        private LevelExitView _currentDoor;

        public void RenderLevel(GameObject levelPrefab)
        {
            if (levelPrefab == null)
            {
                return;
            }

            if (_currentLevelInstance != null)
            {
                Destroy(_currentLevelInstance);
            }

            _currentLevelInstance = Instantiate(levelPrefab);

            _currentDoor = _currentLevelInstance.GetComponentInChildren<LevelExitView>();
            if (_currentDoor != null)
            {
                _triggerDisposable.Disposable = _currentDoor.OnPlayerEnter
                    .Subscribe(_ => _onTriggerEntered.OnNext(Unit.Default));
                
                _currentDoor.CloseDoor();
            }

            var spawnPointTransform = _currentLevelInstance.transform.Find("SpawnPoint");
            if (spawnPointTransform != null)
            {
                _onSpawnPositionFound.OnNext(spawnPointTransform.position);
            }

            var enemySpawns = _currentLevelInstance.GetComponentsInChildren<EnemySpawnPoint>();
            if (enemySpawns != null && enemySpawns.Length > 0)
            {
                _onEnemySpawnPointsFound.OnNext(enemySpawns);
            }
        }
        
        public void OpenDoor()
        {
            _currentDoor?.OpenDoor();
        }

        public void CloseDoor()
        {
            _currentDoor?.CloseDoor();
        }
    }
}