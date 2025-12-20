using System.Text;
using TMPro;
using UnityEngine;
using UnityEngine.Networking;
using System.Collections;

public class CRMConnector : MonoBehaviour
{
    [Header("UI")]
    [SerializeField] private TMP_Text text;

    // URL del servidor local
    private string serverURL = "http://localhost:3000/api/button-action";

    // Classes per serialitzar les dades (JSON)
    [System.Serializable]
    public class DataToSend
    {
        public string playerId;
        public string action;
    }

    [System.Serializable]
    public class RecievedData
    {
        public string message;
        public string reward;
    }

    // Funció cridada des del Botó
    public void SendPetition()
    {
        StartCoroutine(PostRequest());
    }

    private IEnumerator PostRequest()
    {
        // Preparem les dades a enviar
        DataToSend data = new DataToSend();
        data.playerId = "Player 01";
        data.action = "Button Clicked";

        string jsonToSend = JsonUtility.ToJson(data);

        // Configurem la petició web (UnityWebRequest)
        using (UnityWebRequest request = new UnityWebRequest(serverURL, "POST"))
        {
            byte[] bodyRaw = Encoding.UTF8.GetBytes(jsonToSend);
            request.uploadHandler = new UploadHandlerRaw(bodyRaw);
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");

            text.text = "Sending...";

            // Enviem i esperem resposta
            yield return request.SendWebRequest();

            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError("Error: " + request.error);
                text.text = "Connection Error.";
            }
            else
            {
                // Processem la resposta del servidor
                string jsonResponse = request.downloadHandler.text;
                Debug.Log("Recieved: " + jsonResponse);

                // Convertim el JSON del servidor a objecte C#
                RecievedData response = JsonUtility.FromJson<RecievedData>(jsonResponse);

                // Mostrem el text a la UI
                text.text = response.message + "\nReward: " + response.reward;
            }
        }
    }
}
