using UnityEngine;
using UnityEngine.UI;
using R3;

namespace Features.MainMenu
{
    public class MainMenuView : MonoBehaviour
    {
        [SerializeField] private Button _playButton;
        [SerializeField] private Button _shopButton;
        [SerializeField] private Button _exitButton;

        private readonly Subject<Unit> _onPlayClicked = new();
        private readonly Subject<Unit> _onShopClicked = new();
        private readonly Subject<Unit> _onExitClicked = new();

        public Observable<Unit> OnPlayClicked => _onPlayClicked;
        public Observable<Unit> OnShopClicked => _onShopClicked;
        public Observable<Unit> OnExitClicked => _onExitClicked;

        private void Start()
        {
            _playButton
                .OnClickAsObservable()
                .Subscribe(_onPlayClicked.AsObserver())
                .AddTo(this);
            
            _shopButton
                .OnClickAsObservable()
                .Subscribe(_onShopClicked.AsObserver())
                .AddTo(this);

            _exitButton
                .OnClickAsObservable()
                .Subscribe(_onExitClicked.AsObserver())
                .AddTo(this);
        }
    }
}