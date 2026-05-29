using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace Features.XPSystem
{
    public class XPView : MonoBehaviour
    {
        [SerializeField] private TMP_Text _levelCounterText;
        [SerializeField] private Slider _xpSlider;
        
        public void UpdateXPInfo(int currentLevel, int currentXP, int xpNeededToLevelUp)
        {
            _levelCounterText.text = "Lv. " + currentLevel;
            
            _xpSlider.maxValue = xpNeededToLevelUp;
            _xpSlider.value = currentXP;
        }
    }
}