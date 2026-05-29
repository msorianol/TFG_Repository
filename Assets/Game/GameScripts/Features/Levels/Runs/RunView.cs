using UnityEngine;
using UnityEngine.UI;
using TMPro;

namespace Features.Levels.Runs
{
    public class RunView : MonoBehaviour
    {
        [SerializeField] private TMP_Text _levelsCounterText;

        public void UpdateRunInfo(int currentLevel, int totalLevels)
        {
            _levelsCounterText.text = currentLevel + 1 + " / " + totalLevels;
        }
    }
}