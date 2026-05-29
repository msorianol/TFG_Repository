using System;
using UnityEngine;
using R3;
using Features.Enemies;

namespace Features.XPSystem
{
    public class XPController : IDisposable
    {
        private readonly CompositeDisposable _disposables = new();
        private readonly XPModel _xpModel;
        private readonly XPView _xpView;
        private readonly EnemiesModel _enemiesModel;

        public XPController(XPModel xpModel, XPView xpView, EnemiesModel enemiesModel)
        {
            _xpModel = xpModel;
            _xpView = xpView;
            _enemiesModel = enemiesModel;
            
            Init();

            _enemiesModel.OnEnemyKilled
                .Subscribe(AddXP)
                .AddTo(_disposables);
        }

        private void Init()
        {
            _xpView.UpdateXPInfo(_xpModel.CurrentLevel.Value, _xpModel.CurrentXP.Value, _xpModel.XPToNextLevel.Value);
        }

        private void AddXP(int amount)
        {
            _xpModel.CurrentXP.Value += amount;
            _xpModel.TotalAccumulatedXP.Value += amount;
            CheckLevelUp();
        }
        
        private void CheckLevelUp()
        {
            while (_xpModel.CurrentXP.Value >= _xpModel.XPToNextLevel.Value)
            {
                _xpModel.CurrentXP.Value -= _xpModel.XPToNextLevel.Value;
                
                _xpModel.CurrentLevel.Value++;
                
                _xpModel.OnLevelUp.OnNext(_xpModel.CurrentLevel.Value);
                
                var nextThreshold = Mathf.RoundToInt(_xpModel.XPToNextLevel.Value * 1.5f);
                _xpModel.XPToNextLevel.Value = nextThreshold;
            }
            
            _xpView.UpdateXPInfo(_xpModel.CurrentLevel.Value, _xpModel.CurrentXP.Value, _xpModel.XPToNextLevel.Value);
        }

        public void Dispose()
        {
            _disposables.Dispose();
        }
    }
}