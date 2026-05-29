using System;
using System.Linq;
using UnityEngine;
using R3;
using Features.Player;
using Features.XPSystem;

namespace Features.Upgrades
{
    public class UpgradesController : IDisposable
    {
        private readonly CompositeDisposable _disposables = new();
        private readonly UpgradesModel _upgradesModel;
        private readonly UpgradesView _upgradesView;
        private readonly XPModel _xpModel;
        private readonly PlayerModel _playerModel;
        private readonly UpgradeDataSO[] _fullPool;

        public UpgradesController(UpgradesModel upgradesModel, UpgradesView upgradesView,
            XPModel xpModel, UpgradeDataSO[] fullPool)
        {
            _upgradesModel = upgradesModel;
            _upgradesView = upgradesView;
            _xpModel = xpModel;
            _fullPool = fullPool;

            _xpModel.OnLevelUp
                .Subscribe(_ => TriggerLevelUpEvent())
                .AddTo(_disposables);

            _upgradesModel.CurrentChoices
                .Where(choices => choices != null)
                .Subscribe(choices => _upgradesView.ShowChoices(choices))
                .AddTo(_disposables);

            _upgradesView.OnUpgradeSelected
                .Subscribe(HandleUpgradeSelection)
                .AddTo(_disposables);
        }

        private void TriggerLevelUpEvent()
        {
            Time.timeScale = 0f;

            var selectedChoices = _fullPool.OrderBy(x => UnityEngine.Random.value).Take(3).ToArray();
            _upgradesModel.CurrentChoices.Value = selectedChoices;
        }

        private void HandleUpgradeSelection(UpgradeDataSO selectedData)
        {
            switch (selectedData.Type)
            {
                case UpgradeType.IncreaseDamage:
                    _upgradesModel.DamageUpgrade.TotalModifierPercent.Value += selectedData.Value;
                    break;
                case UpgradeType.IncreaseHealth:
                    _upgradesModel.HealthUpgrade.TotalModifierPercent.Value += selectedData.Value;
                    break;
                default:
                    Debug.LogError("[UPGRADES] Upgrade type not implemented: " + selectedData.Type);
                    break;
            }

            _upgradesModel.CurrentChoices.Value = null;
            _upgradesView.HideChoices();
            Time.timeScale = 1f;
        }

        public void Dispose()
        {
            _disposables.Dispose();
        }
    }
}