using Features.Player;
using UnityEngine;

namespace TFG.Scripts.Items
{
    [CreateAssetMenu(fileName = "SkinColor", menuName = "Shop/Effects/Change Skin Color")]
    public class ChangePlayerSkin : ItemEffect
    {
        [SerializeField] private Color _skinColor = Color.white;
        
        private const string PREFS_KEY = "equipped_skin_color";
 
        public override void Apply()
        {
            PlayerPrefs.SetString(PREFS_KEY, "#" + ColorUtility.ToHtmlStringRGB(_skinColor));
            PlayerPrefs.Save();
        }
    }
}