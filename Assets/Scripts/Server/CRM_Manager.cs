using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

public class CRM_Manager : MonoBehaviour
{
    private readonly string _serverUrl = "http://localhost:3000/api/get-event";
    private string _lastEventName = "";

    public static event Action<string, float, string> OnPriceUpdated;

    void Start()
    {
        StartCoroutine(PollServerRoutine());
    }

    IEnumerator PollServerRoutine()
    {
        while (true)
        {
            yield return StartCoroutine(CheckForEventUpdates());

            yield return StartCoroutine(GetItemPrice("sword"));
            yield return StartCoroutine(GetItemPrice("shield"));

            // S'espera 5 segons abans de tornar a preguntar (no es fa cada frame o si no se saturaria el servidor)
            yield return new WaitForSeconds(5f);
        }
    }

    IEnumerator CheckForEventUpdates()
    {
        // S'afegeix l'hora actual a la URL. Això "enganya" Unity perquè cregui que és una petició nova cada vegada
        string antiCacheUrl = _serverUrl + "?t=" + DateTime.Now.Ticks;

        using (UnityWebRequest request = UnityWebRequest.Get(antiCacheUrl))
        {
            yield return request.SendWebRequest();

            if (request.result == UnityWebRequest.Result.Success)
            {
                string json = request.downloadHandler.text;
                EventResponse eventResponse = JsonUtility.FromJson<EventResponse>(json);

                // Només s'apliquen canvis si l'esdeveniment és nou
                if (eventResponse.name != _lastEventName)
                {
                    Debug.Log("New event: " + eventResponse.name);
                    _lastEventName = eventResponse.name;
                    ApplyEventChanges(eventResponse);
                }
            }
            else
            {
                Debug.LogWarning("Error (trying again in 5s): " + request.error);
            }
        }
    }

    IEnumerator GetItemPrice(string itemId)
    {
        string url = "http://localhost:3000/api/get-price";

        WWWForm form = new WWWForm();
        form.AddField("itemId", itemId);
        form.AddField("region", "CAT"); // simulació de regió

        using (UnityWebRequest request = UnityWebRequest.Post(url, form))
        {
            yield return request.SendWebRequest();

            if (request.result == UnityWebRequest.Result.Success)
            {
                PriceResponse response = JsonUtility.FromJson<PriceResponse>(request.downloadHandler.text);

                string currencySymbol = string.IsNullOrEmpty(response.currency) ? "?" : response.currency;
                OnPriceUpdated?.Invoke(itemId, response.price, currencySymbol);

                // Debug.Log($"Price recieved for {itemId}: {response.price} {currencySymbol}");
            }
        }
    }

    void ApplyEventChanges(EventResponse response)
    {
        Color newColor;
        if (ColorUtility.TryParseHtmlString(response.color, out newColor))
        {
            if (Camera.main != null) Camera.main.backgroundColor = newColor;
        }

        Debug.Log("Message from the CRM: " + response.message);
    }
}