using UnityEngine;
using R3;
using R3.Triggers;

namespace Features.Levels.Levels
{
    public class LevelExitView : MonoBehaviour
    {
        [SerializeField] private BoxCollider _doorBoxCollider;

        public Observable<Unit> OnPlayerEnter => this.OnTriggerEnterAsObservable()
            .Where(other => other.CompareTag("Player"))
            .Select(_ => Unit.Default);
        
        public void OpenDoor()
        {
            _doorBoxCollider.enabled = false;
        }

        public void CloseDoor()
        {
            _doorBoxCollider.enabled = true;
        }
    }
}
