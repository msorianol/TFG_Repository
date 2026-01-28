using UnityEngine;
using UnityEngine.Networking;
using System.Collections;
using System;

public class DatabaseClient : MonoBehaviour
{
    string serverUrl = "http://localhost:3000/api/get-event";

    private string lastEventName = "";

    public static Action<string, float> OnPriceUpdated;

    void Start()
    {
        StartCoroutine(PollServerRoutine());
        StartCoroutine(GetItemPrice("sword"));
        StartCoroutine(GetItemPrice("shield"));
    }

    IEnumerator PollServerRoutine()
    {
        while (true)
        {
            yield return StartCoroutine(CheckForUpdates());

            // S'espera 5 segons abans de tornar a preguntar (no es fa cada frame o si no se saturaria el servidor)
            yield return new WaitForSeconds(5f);
        }
    }

    IEnumerator CheckForUpdates()
    {
        // S'afegeix l'hora actual a la URL. Això enganya Unity perquè cregui que és una petició nova cada vegada.
        string antiCacheUrl = serverUrl + "?t=" + System.DateTime.Now.Ticks;

        using (UnityWebRequest request = UnityWebRequest.Get(antiCacheUrl))
        {
            yield return request.SendWebRequest();

            if (request.result == UnityWebRequest.Result.Success)
            {
                string json = request.downloadHandler.text;
                EventData data = JsonUtility.FromJson<EventData>(json);

                // Només s'apliquen canvis si l'esdeveniment és nou
                if (data.name != lastEventName)
                {
                    Debug.Log("New event: " + data.name);
                    lastEventName = data.name;
                    ApplyChanges(data);
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
        form.AddField("region", "CAT"); // simulació de regió (s'haurà d'implementar més endavant la lectura de la IP per saber la regió de cada jugador)

        using (UnityWebRequest request = UnityWebRequest.Post(url, form))
        {
            yield return request.SendWebRequest();

            if (request.result == UnityWebRequest.Result.Success)
            {
                PriceResponse response = JsonUtility.FromJson<PriceResponse>(request.downloadHandler.text);

                OnPriceUpdated?.Invoke(itemId, response.price);

                Debug.Log($"Price recieved for {itemId}: {response.price}€");
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

        Debug.Log("Message from the CRM: " + data.message);
    }
}