using Server;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

public class CanvasController : MonoBehaviour
{
    [Header("TEXTS")] [SerializeField] private TMP_Text swordPriceText;
    [SerializeField] private TMP_Text shieldPriceText;

    [Header("BACKGROUND & IMAGES")] [SerializeField]
    private Image shopBackgroundImage;

    [SerializeField] private Sprite normalShopImage;
    [SerializeField] private Sprite christmasShopImage;
    [SerializeField] private Sprite santJordiShopImage;

    private void OnEnable()
    {
        CRM_Manager.OnPriceUpdated += UpdatePriceUI;
        CRM_Manager.OnEventUpdated += UpdateBackgroundImage;
    }

    private void OnDisable()
    {
        CRM_Manager.OnPriceUpdated -= UpdatePriceUI;
        CRM_Manager.OnEventUpdated -= UpdateBackgroundImage;
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

        if (itemId == "sword")
        {
            swordPriceText.text = priceString;
        }
        else if (itemId == "shield")
        {
            shieldPriceText.text = priceString;
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
}