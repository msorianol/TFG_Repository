using TMPro;
using UnityEngine;

public class CanvasController : MonoBehaviour
{
    [Header("UI")] [SerializeField] private TMP_Text swordPriceText;
    [SerializeField] private TMP_Text shieldPriceText;

    private void OnEnable()
    {
        CRM_Manager.OnPriceUpdated += UpdatePriceUI;
    }

    private void OnDisable()
    {
        CRM_Manager.OnPriceUpdated -= UpdatePriceUI;
    }

    void UpdatePriceUI(string itemId, float price, string currency)
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
}