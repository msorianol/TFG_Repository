using System;
using UnityEngine;
using R3;
using Features.Player;
using Features.Account;
using TFG.Scripts.Server.Data;

namespace TFG
{
    public class CRM_Bridge : IDisposable
    {
        private readonly CompositeDisposable _disposables = new();

        public CRM_Bridge(AccountModel accountModel, PlayerDataSO playerData)
        {
            PlayerData.Instance.playerClass = LoadPlayerClass();
            PlayerData.Instance.daysPlayed = LoadDaysPlayed();
            
            accountModel.Level
                .Subscribe(level =>
                {
                    PlayerData.Instance.playerLevel = level;
                    Debug.Log("[BRIDGE] PlayerLevel (account): " +  level);
                })
                .AddTo(_disposables);
 
            accountModel.TotalXP
                .Subscribe(xp =>
                {
                    PlayerData.Instance.playerXP = xp;
                    Debug.Log("[BRIDGE] PlayerXP (account): " + xp);
                })
                .AddTo(_disposables);

            /* We can add here other additional fields: 
            Example: if we have a dynamic system that changes our class:
            playerModel.PlayerClass
                 .Subscribe(cls => PlayerData.Instance.playerClass = cls)
                 .AddTo(_disposables); */
        }

        private static string LoadPlayerClass()
        {
            return PlayerPrefs.GetString("playerClass", "warrior");
        }

        private static int LoadDaysPlayed()
        {
            string today = DateTime.UtcNow.ToString("yyyy-MM-dd");
            string lastSeen = PlayerPrefs.GetString("lastSeenDate", "");

            if (today != lastSeen)
            {
                int days = PlayerPrefs.GetInt("daysPlayed", 0) + 1;
                PlayerPrefs.SetInt("daysPlayed", days);
                PlayerPrefs.SetString("lastSeenDate", today);
                PlayerPrefs.Save();
                return days;
            }

            return PlayerPrefs.GetInt("daysPlayed", 1);
        }

        public void Dispose()
        {
            _disposables.Dispose();
        }
    }
}