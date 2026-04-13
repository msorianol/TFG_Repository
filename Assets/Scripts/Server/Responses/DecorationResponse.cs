using System;

namespace Server.Responses
{
    [Serializable]
    public class DecorationResponse
    {
        public string[] decorations;
        public int cacheTtlSeconds;
    }
}