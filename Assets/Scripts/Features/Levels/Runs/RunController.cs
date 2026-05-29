using UnityEngine.SceneManagement;
using R3;
using StarterAssets;
using Core.Installers;
using Features.Levels.Levels;
using Features.XPSystem;

namespace Features.Levels.Runs
{
    public class RunController
    {
        private readonly CompositeDisposable _disposables = new();
        private readonly RunModel _runModel;
        private readonly RunView _runView;
        private readonly LevelModel _levelModel;
        private readonly LevelView _levelView;
        private readonly ThirdPersonController _playerController;
        private readonly XPModel _xpModel;

        public RunController(RunModel runModel, RunView runView, LevelModel levelModel, LevelView levelView,
            ThirdPersonController playerController, XPModel xpModel)
        {
            _runModel = runModel;
            _runView = runView;
            _levelModel = levelModel;
            _levelView = levelView;
            _playerController = playerController;
            _xpModel = xpModel;

            _levelView.OnTriggerEntered
                .Subscribe(_ =>
                {
                    _levelModel.RoomState.Value = LevelState.Exited;
                    
                    AdvanceToNextLevel();
                })
                .AddTo(_disposables);

            _runModel.CurrentLevelIndex
                .Subscribe(_ =>
                {
                    _runView.UpdateRunInfo(_runModel.CurrentLevelIndex.Value, _runModel.MaxLevelsInRun.Value);
                    LoadCurrentLevel();
                })
                .AddTo(_disposables);

            _levelView.OnSpawnPositionFound
                .Subscribe(pos => { _playerController.ForceChangePlayerPosition(pos); })
                .AddTo(_disposables);
        }

        private void AdvanceToNextLevel()
        {
            if (_runModel.CurrentLevelIndex.Value + 1 < _runModel.MaxLevelsInRun.Value)
            {
                _runModel.CurrentLevelIndex.Value++;
            }
            else if (_runModel.CurrentLevelIndex.Value + 1 == _runModel.MaxLevelsInRun.Value)
            {
                int xpGuanyada = _xpModel.TotalAccumulatedXP.Value;
                GeneralInstaller.Instance.GlobalAccountController.OnRunCompleted(xpGuanyada);
                
                string scene = _runModel.GoToSceneName.Value;
                if (!string.IsNullOrEmpty(scene))
                {
                    SceneManager.LoadScene(scene);
                }
            }
        }

        private void LoadCurrentLevel()
        {
            var levelPrefab = _runModel.RunData.LevelPrefabs[_runModel.CurrentLevelIndex.Value];

            if (levelPrefab != null)
            {
                _levelModel.CurrentLevel.Value = levelPrefab;
            }
        }

        public void Dispose()
        {
            _disposables.Dispose();
        }
    }
}