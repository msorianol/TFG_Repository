using UnityEngine;
using UnityEngine.Networking;
using System.Collections;

public class EventData
{
    public string name;
    public string message;
    public string color;
}

public class DatabaseClient : MonoBehaviour
{
    string serverUrl = "http://localhost:3000/api/get-event";

    // Guardem l'últim esdeveniment per no fer canvis si no cal
    private string lastEventName = "";

    void Start()
    {
        // Engeguem el bucle infinit
        StartCoroutine(PollServerRoutine());
    }

    IEnumerator PollServerRoutine()
    {
        // Aquest bucle s'executarà per sempre mentre el joc estigui obert
        while (true)
        {
            yield return StartCoroutine(CheckForUpdates());

            // Esperem 5 segons abans de tornar a preguntar
            // (No ho facis cada frame o saturaràs el servidor!)
            yield return new WaitForSeconds(5f);
        }
    }

    IEnumerator CheckForUpdates()
    {
        // TRUC ANTI-CACHÉ: Afegim l'hora actual a la URL.
        // Això enganya Unity perquè cregui que és una petició nova cada vegada.
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

    void ApplyChanges(EventData data)
    {
        Color newColor;
        if (ColorUtility.TryParseHtmlString(data.color, out newColor))
        {
            Camera.main.backgroundColor = newColor;
        }
    }
}