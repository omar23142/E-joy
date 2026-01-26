document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const tabTranslate = document.getElementById('tab-translate');
  const tabList = document.getElementById('tab-list');
  const translateView = document.getElementById('translate-view');
  const listView = document.getElementById('list-view');
  
  const inputText = document.getElementById('input-text');
  const translateBtn = document.getElementById('translate-btn');
  const loader = document.getElementById('loader');
  const btnText = document.querySelector('.btn-text');
  
  const resultArea = document.getElementById('result-area');
  const displayOriginal = document.getElementById('display-original');
  const displayTranslated = document.getElementById('display-translated');
  const addBtn = document.getElementById('add-btn');
  
  const wordsContainer = document.getElementById('words-container');
  const emptyState = document.getElementById('empty-state');

  // State
  let currentOriginal = '';
  let currentTranslated = '';

  // --- Navigation ---
  tabTranslate.addEventListener('click', () => {
    switchTab('translate');
  });

  tabList.addEventListener('click', () => {
    switchTab('list');
    loadWords();
  });

  function switchTab(tab) {
    if (tab === 'translate') {
      tabTranslate.classList.add('active');
      tabList.classList.remove('active');
      translateView.style.display = 'block';
      listView.style.display = 'none';
    } else {
      tabTranslate.classList.remove('active');
      tabList.classList.add('active');
      translateView.style.display = 'none';
      listView.style.display = 'block';
    }
  }

  // --- Translation ---
  translateBtn.addEventListener('click', async () => {
    const text = inputText.value.trim();
    if (!text) return;

    setLoading(true);
    resultArea.style.display = 'none';

    try {
      const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ar`);
      const data = await response.json();

      if (data.responseData) {
        currentOriginal = text;
        currentTranslated = data.responseData.translatedText;
        
        displayOriginal.textContent = currentOriginal;
        displayTranslated.textContent = currentTranslated;
        
        resultArea.style.display = 'block';
        updateAddButtonState(currentOriginal);
      }
    } catch (error) {
      console.error('Translation error:', error);
      alert('Failed to translate. Please try again.');
    } finally {
      setLoading(false);
    }
  });

  function setLoading(isLoading) {
    if (isLoading) {
      loader.style.display = 'block';
      btnText.style.display = 'none';
      translateBtn.disabled = true;
    } else {
      loader.style.display = 'none';
      btnText.style.display = 'block';
      translateBtn.disabled = false;
    }
  }

  // --- Storage & List ---
  addBtn.addEventListener('click', () => {
    addWord(currentOriginal, currentTranslated);
    addBtn.textContent = 'Saved ✓';
    addBtn.disabled = true;
  });

  function addWord(original, translated) {
    chrome.storage.local.get(['words'], (result) => {
      const words = result.words || [];
      // Check for duplicates
      if (!words.some(w => w.original.toLowerCase() === original.toLowerCase())) {
        words.unshift({
          original,
          translated,
          id: Date.now()
        });
        chrome.storage.local.set({ words }, () => {
          console.log('Word saved');
        });
      }
    });
  }

  function loadWords() {
    chrome.storage.local.get(['words'], (result) => {
      const words = result.words || [];
      renderList(words);
    });
  }

  function renderList(words) {
    wordsContainer.innerHTML = '';
    
    if (words.length === 0) {
      emptyState.style.display = 'block';
      return;
    }
    
    emptyState.style.display = 'none';

    words.forEach(word => {
      const el = document.createElement('div');
      el.className = 'word-item';
      
      el.innerHTML = `
        <div class="word-content">
          <span class="word-original">${escapeHtml(word.original)}</span>
          <span class="word-translated">${escapeHtml(word.translated)}</span>
        </div>
        <button class="delete-btn" data-id="${word.id}" title="Remove">
           ✕
        </button>
      `;
      
      wordsContainer.appendChild(el);
    });

    // Add delete listeners
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.target.dataset.id);
        deleteWord(id);
      });
    });
  }

  function deleteWord(id) {
    chrome.storage.local.get(['words'], (result) => {
      const words = result.words || [];
      const newWords = words.filter(w => w.id !== id);
      chrome.storage.local.set({ words: newWords }, () => {
        loadWords(); // Reload list
      });
    });
  }

  function updateAddButtonState(text) {
     chrome.storage.local.get(['words'], (result) => {
      const words = result.words || [];
      const exists = words.some(w => w.original.toLowerCase() === text.toLowerCase());
      if (exists) {
        addBtn.textContent = 'Saved ✓';
        addBtn.disabled = true;
      } else {
        addBtn.textContent = '+ Add to List';
        addBtn.disabled = false;
      }
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});
