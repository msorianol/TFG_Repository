using UnityEngine;
using UnityEngine.UI;
using R3;

namespace Features.InGameMenu
{
    public class InGameMenuView : MonoBehaviour
    {
        [SerializeField] private Button _pauseGameButton;
        [SerializeField] private Button _returnToMenuButton;
    
        private readonly Subject<Unit> _onPauseClicked = new();
        public Observable<Unit> PauseClicked => _onPauseClicked;
        
        private readonly Subject<Unit> _onReturnToMenuClicked = new();
        public Observable<Unit> ReturnToMenuClicked => _onReturnToMenuClicked;

        private void Start()
        {
            ChangeButtonState(false);
        
            _pauseGameButton
                .OnClickAsObservable()
                .Subscribe(_onPauseClicked.AsObserver())
                .AddTo(this);
            
            _returnToMenuButton
                .OnClickAsObservable()
                .Subscribe(_onReturnToMenuClicked.AsObserver())
                .AddTo(this);
        }

        public void ChangeButtonState(bool state)
        {
            _returnToMenuButton.gameObject.SetActive(state);
        }
    }
}