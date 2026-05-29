using Core.Installers;
using UnityEngine;
using UnityEngine.UI;
using TMPro;

namespace Features.Account
{
    public class AccountView : MonoBehaviour
    {
        [SerializeField] private TMP_Text _levelText;
        [SerializeField] private Slider _xpSlider;

        private void Start()
        {
            if (GeneralInstaller.Instance != null)
            {
                GeneralInstaller.Instance.GlobalAccountController.RegisterView(this);
            }
        }
        
        public void UpdateDisplay(int level, int currentXP, int xpToNext)
        {
            if (_levelText != null)
            {
                _levelText.text = "Player Level: " + level;
            }

            /* if (_xpText != null)
            {
                _xpText.text = currentXP + " / " + xpToNext + " XP";
            }*/

            if (_xpSlider != null)
            {
                _xpSlider.maxValue = xpToNext;
                _xpSlider.value = currentXP;
            }
        }
        
        public void ShowLevelUpEffect(int newLevel)
        {
            // We can later add here a LevelUp effect
            Debug.Log("[Account] LEVEL UP! New level:" + newLevel);
        }
        
        private void OnDestroy()
        {
            if (GeneralInstaller.Instance != null && GeneralInstaller.Instance.GlobalAccountController != null)
            {
                GeneralInstaller.Instance.GlobalAccountController.UnRegisterView(this);
            }
        }
    }
}