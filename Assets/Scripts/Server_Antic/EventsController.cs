using UnityEngine;
using UnityEngine.Networking;
using System.Collections;
using TMPro;
using UnityEngine.UI;

// Aquesta classe ha de tenir ELS MATEIXOS noms que el JSON del servidor
public class GameConfigData
{
    public string activeEvent;    // Coincideix amb gameState.activeEvent
    public string welcomeMessage; // Coincideix amb gameState.welcomeMessage
}

public class EventsController : MonoBehaviour
{
    [Header("UI Elements")]
    public GameObject objectToModify;
    public TMP_Text welcomeText;
    public string color; 

    private string userType = "VIP";

    private string configURL = "http://localhost:3000/api/check-user";

    void Start()
    {
        string finalUrl = configURL + "?type=" + userType;

        // Quan comença el joc, demanem la config al servidor
        StartCoroutine(GetGameConfig(finalUrl));
    }

    private IEnumerator GetGameConfig(string URL)
    {
        using (UnityWebRequest request = UnityWebRequest.Get(configURL))
        {
            yield return request.SendWebRequest();

            if (request.result == UnityWebRequest.Result.Success)
            {
                string json = request.downloadHandler.text;
                Debug.Log("Config received: " + json);

                // Convertim JSON a C#
                GameConfigData config = JsonUtility.FromJson<GameConfigData>(json);

                ApplyChanges(config);
            }
            else
            {
                Debug.LogError("Error connecting to CRM: " + request.error);
            }
        }
    }

    void ApplyChanges(GameConfigData config)
    {
        // 1. Actualitzem el text
        if (welcomeText != null)
            welcomeText.text = config.welcomeMessage;

        // 2. Canviem l'aspecte visual segons l'esdeveniment
        Image image = objectToModify.GetComponent<Image>();

        // IMPORTANT: Els strings han de coincidir amb els 'values' dels botons HTML
        switch (config.activeEvent)
        {
            case "christmas":
                // Vermell per Nadal
                image.color = Color.red;
                break;

            case "sant_jordi":
                // Groc per Sant Jordi
                image.color = Color.yellow;
                break;

            case "normal":
            default:
                // Blanc per defecte
                image.color = Color.white;
                break;
        }
    }
}