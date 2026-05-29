namespace Core
{
    public interface IUpdateLoop
    {
        void RegisterUpdateable(IUpdateableObjects obj);
        void UnregisterUpdateable(IUpdateableObjects obj);
    }
}
