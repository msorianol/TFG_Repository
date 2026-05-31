using System;

namespace TFG.Scripts.Server.Responses
{
    [Serializable]
    public class ShopResponse
    {
        public string[] items;
        public int cacheTtlSeconds;
    }
}