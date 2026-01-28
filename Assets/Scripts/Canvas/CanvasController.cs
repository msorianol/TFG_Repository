using TMPro;
using UnityEngine;

public class CanvasController : MonoBehaviour
{
    [Header("UI")]
    [SerializeField] private TMP_Text swordPriceText;
    [SerializeField] private TMP_Text shieldPriceText;

    private void OnEnable()
    {
        DatabaseClient.OnPriceUpdated += UpdatePriceUI;
    }

    private void OnDisable()
    {
        DatabaseClient.OnPriceUpdated -= UpdatePriceUI;
    }

    void UpdatePriceUI(string itemId, float price)
    {
        string priceString = price.ToString("0.00") + " €";

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
