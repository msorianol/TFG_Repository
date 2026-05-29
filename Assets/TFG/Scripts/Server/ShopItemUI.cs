using UnityEngine;
using UnityEngine.UI;
using TMPro;
using TFG.Scripts.Server.Data;

namespace TFG.Scripts.Server
{
    public class ShopItemUI : MonoBehaviour
    {
        [SerializeField] private Button buyButton;
        private ItemDisplayData _data;

        public string currentItemId;
        public Image itemIcon;
        public TMP_Text itemNameText;
        public TMP_Text itemPriceText;

        public void Setup(ItemDisplayData data)
        {
            _data = data;
            currentItemId = data.itemId;
            itemNameText.text = data.displayName;
            itemIcon.sprite = data.icon;
            itemPriceText.text = "";
            
            buyButton.onClick.RemoveAllListeners();
            buyButton.onClick.AddListener(OnClick);
        }

        public void UpdatePrice(string priceString)
        {
            itemPriceText.text = priceString;
        }
        
        private void OnClick()
        {
            if (_data?.effect == null)
            {
                Debug.LogWarning($"[ShopItemUI] L'item {currentItemId} no te cap efecte assignat.");
                return;
            }
 
            _data.effect.Apply();
            Debug.Log($"[ShopItemUI] Efecte aplicat: {_data.effect.name}");
        }
    }
}