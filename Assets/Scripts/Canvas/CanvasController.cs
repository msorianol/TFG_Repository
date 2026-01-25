using UnityEngine;
using UnityEngine.Networking;
using TMPro;
using System.Collections;

public class CanvasController : MonoBehaviour
{
    [Header("UI")]
    public TextMeshProUGUI priceText;

    private void OnEnable()
    {
        DatabaseClient.OnPriceUpdated += UpdatePriceUI;
    }

    private void OnDisable()
    {
        DatabaseClient.OnPriceUpdated -= UpdatePriceUI;
    }

    void UpdatePriceUI(float price)
    {
        priceText.text = price.ToString("0.00") + " €";
    }
}
