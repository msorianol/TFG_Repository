using UnityEngine;
using UnityEngine.UI;
using TMPro;
using R3;

namespace Features.Upgrades
{
    public class UpgradesView : MonoBehaviour
    {
        [SerializeField] private GameObject _uiPanel;
        
        [Header("UI Elements")]
        [SerializeField] private Button[] _upgradeButtons;
        [SerializeField] private TMP_Text[] _upgradeTexts;
        [SerializeField] private Image[] _upgradeImages;

        private UpgradeDataSO[] _currentChoices;

        private readonly Subject<UpgradeDataSO> _onUpgradeSelected = new();
        public Observable<UpgradeDataSO> OnUpgradeSelected => _onUpgradeSelected;

        private void Start()
        {
            for (int i = 0; i < _upgradeButtons.Length; i++)
            {
                int index = i;
                
                _upgradeButtons[index]
                    .OnClickAsObservable()
                    .Subscribe(_ =>
                    {
                        if (_currentChoices != null && index < _currentChoices.Length)
                        {
                            _onUpgradeSelected.OnNext(_currentChoices[index]);
                        }
                    })
                    .AddTo(this);
            }
        }

        public void ShowChoices(UpgradeDataSO[] choices)
        {
            _currentChoices = choices;
            _uiPanel.SetActive(true);

            for (int i = 0; i < choices.Length && i < _upgradeButtons.Length; i++)
            {
                _upgradeTexts[i].text = $"{choices[i].UpgradeName}\n<size=80%>{choices[i].Description}</size>";
                _upgradeImages[i].sprite = choices[i].Icon;
            }
        }

        public void HideChoices()
        {
            _uiPanel.SetActive(false);
            _currentChoices = null;
        }
    }
}