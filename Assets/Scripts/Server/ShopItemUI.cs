using UnityEngine;
using UnityEngine.UI;
using TMPro;
using Server.Data;

namespace Server
{
    public class ShopItemUI : MonoBehaviour
    {
        public string currentItemId;
        public Image itemIcon;
        public TMP_Text itemNameText;
        public TMP_Text itemPriceText;

        public void Setup(ItemDisplayData data)
        {
            currentItemId = data.itemId;
            itemNameText.text = data.displayName;
            itemIcon.sprite = data.icon;
            itemPriceText.text = "";
        }

        public void UpdatePrice(string priceString)
        {
            itemPriceText.text = priceString;
        }
    }
}