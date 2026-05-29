using System;
using Core.Installers;
using UnityEngine;
using R3;

namespace Features.Account
{
    public class AccountController : IDisposable
    {
        private readonly CompositeDisposable _disposables = new();
        private readonly AccountModel _accountModel;
        private AccountView _accountView;

        private const float BASE_XP_MULTIPLIER = 0.25f;

        private const string KEY_LEVEL = "account_level";
        private const string KEY_XP = "account_xp";
        private const string KEY_XP_NEXT = "account_xp_next";

        public AccountController(AccountModel accountModel)
        {
            _accountModel = accountModel;

            LoadData();
            
            _accountModel.Level.Skip(1).Subscribe(v => PlayerPrefs.SetInt(KEY_LEVEL, v)).AddTo(_disposables);
            _accountModel.TotalXP.Skip(1).Subscribe(v => PlayerPrefs.SetInt(KEY_XP, v)).AddTo(_disposables);
            _accountModel.XPToNext.Skip(1).Subscribe(v => PlayerPrefs.SetInt(KEY_XP_NEXT, v)).AddTo(_disposables);

            _accountModel.Level
                .CombineLatest(
                    _accountModel.TotalXP,
                    _accountModel.XPToNext,
                    (level, xp, next) => (level, xp, next))
                .Subscribe(t => _accountView?.UpdateDisplay(t.level, t.xp, t.next))
                .AddTo(_disposables);

            _accountModel.OnLevelUp
                .Subscribe(newLevel =>
                {
                    _accountView?.ShowLevelUpEffect(newLevel);
                    PlayerPrefs.Save();
                })
                .AddTo(_disposables);
        }

        private void LoadData()
        {
            _accountModel.Level.Value = PlayerPrefs.GetInt(KEY_LEVEL, 1);
            _accountModel.TotalXP.Value = PlayerPrefs.GetInt(KEY_XP, 0);
            _accountModel.XPToNext.Value = PlayerPrefs.GetInt(KEY_XP_NEXT, 200);
        }
        
        public void RegisterView(AccountView view)
        {
            _accountView = view;
            
            _accountView?.UpdateDisplay(
                _accountModel.Level.Value,
                _accountModel.TotalXP.Value,
                _accountModel.XPToNext.Value);
        }
        
        public void UnRegisterView(AccountView view)
        {
            if (_accountView == view)
            {
                _accountView = null;
            }
        }

        public void OnRunCompleted(int runXP)
        {
            int accountXP = CalculateAccountXP(runXP);
            Debug.Log($"[Account] Run acabada. RunXP={runXP} -> AccountXP={accountXP}");
            AddXP(accountXP);
        }

        private void AddXP(int amount)
        {
            _accountModel.TotalXP.Value += amount;

            while (_accountModel.TotalXP.Value >= _accountModel.XPToNext.Value)
            {
                _accountModel.TotalXP.Value -= _accountModel.XPToNext.Value;
                _accountModel.Level.Value += 1;
                _accountModel.XPToNext.Value = Mathf.RoundToInt(_accountModel.XPToNext.Value * 1.4f);

                _accountModel.OnLevelUp.OnNext(_accountModel.Level.Value);
            }

            PlayerPrefs.Save();
        }

        // If we need to reset our account, we call this method
        public void ResetAccount()
        {
            _accountModel.Level.Value = 1;
            _accountModel.TotalXP.Value = 0;
            _accountModel.XPToNext.Value = 200;
            PlayerPrefs.Save();
        }

        private int CalculateAccountXP(int runXP)
        {
            int level = _accountModel.Level.Value;
            float multiplier = BASE_XP_MULTIPLIER / (1f + level * 0.03f);
            multiplier = Mathf.Max(multiplier, 0.10f);
            return Mathf.RoundToInt(runXP * multiplier);
        }

        public void Dispose()
        {
            _disposables.Dispose();
        }
    }
}