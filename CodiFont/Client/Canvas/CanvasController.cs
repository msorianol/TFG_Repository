using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;
using TFG.Scripts.Server;
using TFG.Scripts.Server.Data;

namespace TFG.Scripts.Canvas
{
    public class CanvasController : MonoBehaviour
    {
        [Header("DYNAMIC ITEMS")]
        [SerializeField] private Transform itemsContainer;
        [SerializeField] private ShopItemUI itemPrefab; 
        [SerializeField] private List<ItemDisplayData> localItemsDatabase;
    
        private Dictionary<string, ShopItemUI> activeSeasonalItems = new Dictionary<string, ShopItemUI>();

        [Header("BACKGROUND & IMAGES")] 
        [SerializeField] private Image shopBackgroundImage;
        [SerializeField] private Sprite normalShopImage;
        [SerializeField] private Sprite christmasShopImage;
        [SerializeField] private Sprite santJordiShopImage;
        
        [Header("MAIN MENU SCENE")]
        [SerializeField] private string mainMenuSceneName;

        private void OnEnable()
        {
            CRM_Manager.OnPriceUpdated += UpdatePriceUI;
            CRM_Manager.OnEventUpdated += UpdateBackgroundImage;
            CRM_Manager.OnShopItemsUpdated += UpdateSeasonalItemsUI;
        }

        private void OnDisable()
        {
            CRM_Manager.OnPriceUpdated -= UpdatePriceUI;
            CRM_Manager.OnEventUpdated -= UpdateBackgroundImage;
            CRM_Manager.OnShopItemsUpdated -= UpdateSeasonalItemsUI;
        }
    
        private void UpdateSeasonalItemsUI(string[] activeItemIds)
        {
            List<string> toRemove = new List<string>();
        
            foreach (var activeUI in activeSeasonalItems)
            {
                if (System.Array.IndexOf(activeItemIds, activeUI.Key) == -1)
                {
                    Destroy(activeUI.Value.gameObject);
                    toRemove.Add(activeUI.Key);
                }
            }

            foreach (var key in toRemove)
            {
                activeSeasonalItems.Remove(key);
            }

            foreach (string itemId in activeItemIds)
            {
                if (!activeSeasonalItems.ContainsKey(itemId))
                {
                    ItemDisplayData data = localItemsDatabase.Find(x => x.itemId == itemId);
                    if (data != null)
                    {
                        ShopItemUI newUI = Instantiate(itemPrefab, itemsContainer);
                        newUI.Setup(data);
                        activeSeasonalItems.Add(itemId, newUI);
                    }
                    else
                    {
                        Debug.LogWarning("Ítem actiu al servidor però no trobat a la base de dades local: " + itemId);
                    }
                }
            }
        }

        private void UpdatePriceUI(string itemId, float price, string currency)
        {
            string symbol = currency;
            if (currency == "EUR") symbol = "€";
            if (currency == "USD") symbol = "$";
            if (currency == "JPY") symbol = "¥";

            string priceString;
            if (currency == "JPY") priceString = price.ToString("0") + " " + symbol;
            else priceString = price.ToString("0.00") + " " + symbol;
            
            if (activeSeasonalItems.ContainsKey(itemId))
            {
                activeSeasonalItems[itemId].UpdatePrice(priceString);
            }
        }

        private void UpdateBackgroundImage(string eventName)
        {
            if (eventName == "christmas")
            {
                shopBackgroundImage.sprite = christmasShopImage;
            }
            else if (eventName == "sant_jordi")
            {
                shopBackgroundImage.sprite = santJordiShopImage;
            }
            else
            {
                shopBackgroundImage.sprite = normalShopImage;
            }
        }

        // Called in Canvas --> Shop_Root --> Buttons --> ReturnToMenuButton
        public void ReturnToMainMenu()
        {
            SceneManager.LoadScene(mainMenuSceneName);
        } 
        
        // Called in Canvas --> Shop_Root --> Buttons --> ClearPlayerPrefsButton
        public void ClearPlayerPrefs()
        {
            PlayerPrefs.DeleteAll();
            PlayerPrefs.Save();
            
            Debug.LogWarning("[PlayerPrefs] All Player Prefs have been cleared!");
        }
    }
}