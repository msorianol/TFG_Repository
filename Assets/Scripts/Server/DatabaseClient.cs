using UnityEngine;
using UnityEngine.Networking;
using System.Collections;
using System;

public class EventData
{
    public string name;
    public string message;
    public string color;
}

public class PriceResponse
{
    public float price;
}

public class DatabaseClient : MonoBehaviour
{
    string serverUrl = "http://localhost:3000/api/get-event";

    private string lastEventName = "";

    public static Action<float> OnPriceUpdated;

    void Start()
    {
        StartCoroutine(PollServerRoutine());
        StartCoroutine(GetItemPrice("sword"));
    }

    IEnumerator PollServerRoutine()
    {
        while (true)
        {
            yield return StartCoroutine(CheckForUpdates());

            // Esperem 5 segons abans de tornar a preguntar (no es fa cada frame o si no se saturaria el servidor)
            yield return new WaitForSeconds(5f);
        }
    }

    IEnumerator CheckForUpdates()
    {
        // Afegim l'hora actual a la URL. Això enganya Unity perquè cregui que és una petició nova cada vegada.
        string antiCacheUrl = serverUrl + "?t=" + System.DateTime.Now.Ticks;

        using (UnityWebRequest request = UnityWebRequest.Get(antiCacheUrl))
        {
            yield return request.SendWebRequest();

            if (request.result == UnityWebRequest.Result.Success)
            {
                string json = request.downloadHandler.text;
                EventData data = JsonUtility.FromJson<EventData>(json);

                // Només apliquem canvis si l'esdeveniment és nou
                if (data.name != lastEventName)
                {
                    Debug.Log("🚨 CANVI DETECTAT EN RUNTIME! Nou mode: " + data.name);
                    lastEventName = data.name;
                    ApplyChanges(data);
                }
            }
            else
            {
                Debug.LogWarning("Error connectant (intentant de nou en 5s): " + request.error);
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

                OnPriceUpdated?.Invoke(response.price);

                Debug.Log("💰 Preu rebut del CRM: " + response.price + "€");
            }
        }
    }

    void ApplyChanges(EventData data)
    {
        Color newColor;
        if (ColorUtility.TryParseHtmlString(data.color, out newColor))
        {
            Camera.main.backgroundColor = newColor;
        }

        Debug.Log("Missatge CRM: " + data.message);
    }
}