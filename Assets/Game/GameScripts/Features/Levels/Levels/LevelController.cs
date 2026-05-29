using System;
using R3;
using Features.Enemies;

namespace Features.Levels.Levels
{
    public class LevelController : IDisposable
    {
        private readonly CompositeDisposable _disposables = new();
        private readonly LevelModel _levelModel;
        private readonly LevelView _levelView;
        private readonly EnemiesModel _enemiesModel;

        public LevelController(LevelModel model, LevelView view, EnemiesModel enemiesModel)
        {
            _levelModel = model;
            _levelView = view;
            _enemiesModel = enemiesModel;

            _levelModel.CurrentLevel
                .Subscribe(_ =>
                {
                    _levelModel.RoomState.Value = LevelState.Entered;
                    
                    view.RenderLevel(_levelModel.CurrentLevel.Value);
                })
                .AddTo(_disposables);
            
            _levelModel.RoomState
                .Subscribe(OnLevelStateChanged)
                .AddTo(_disposables);
            
            _levelView.OnEnemySpawnPointsFound
                .Subscribe(points => _levelModel.SpawnPoints.Value = points)
                .AddTo(_disposables);

            _enemiesModel.OnAliveEnemiesChanged
                .Subscribe(count =>
                {
                    if (_levelModel.RoomState.Value == LevelState.Entered && count > 0)
                    {
                        _levelModel.RoomState.Value = LevelState.CombatActive;
                    }
                    else if (_levelModel.RoomState.Value == LevelState.CombatActive && count == 0)
                    {
                        _levelModel.RoomState.Value = LevelState.Cleared;
                    }
                })
                .AddTo(_disposables);
        }
        
        private void OnLevelStateChanged(LevelState state)
        {
            switch (state)
            {
                case LevelState.CombatActive:
                    _levelView.CloseDoor();
                    break;
                case LevelState.Cleared:
                    _levelView.OpenDoor();
                    break;
            }
        }

        public void Dispose()
        {
            _disposables.Dispose();
        }
    }
}