using System;

namespace Server.Responses
{
    [Serializable]
    public class EventResponse
    {
        public string name;
        public string message;
        public int cacheTtlSeconds;
    }
}
