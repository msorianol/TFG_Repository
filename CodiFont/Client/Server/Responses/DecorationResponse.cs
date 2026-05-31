using System;

namespace TFG.Scripts.Server.Responses
{
    [Serializable]
    public class DecorationResponse
    {
        public string[] decorations;
        public int cacheTtlSeconds;
    }
}