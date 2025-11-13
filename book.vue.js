// Drop this in the same folder as index.html and styles.css
const { createApp } = Vue;

createApp({
  data() {
    return {
      // simple page routing: 'login' | 'bookstore' | 'cart' | 'detail' | 'confirmation'
      page: 'login',

      // demo preset users (client-side demo only)
      presetUsers: [
        { id: 1, name: 'Parent User', email: 'parent@example.com', password: '123' },
        { id: 2, name: 'Student User', email: 'student@example.com', password: '234' }
      ],
      user: null,

      // login form
      loginForm: { email: '', password: '' },
      loginError: '',

      // lessons: 10 items with subject, location, price, spaces, instructor, schedule, description
      lessons: [],

      // cart and purchases recorded client-side
      cart: [],
      lastPurchase: { items: [], total: 0 },

      // toolbar / filters
      search: '',
      filterLocation: '',
      sortBy: 'default',

      // checkout state
      checkoutLoading: false,

      // lesson detail view
      detailLesson: {}
    };
  },

  computed: {
    // derived data for unique locations
    uniqueLocations() {
      const set = new Set(this.lessons.map(l => l.location));
      return Array.from(set).sort();
    },

    // filtered and sorted list
    filteredLessons() {
      let out = this.lessons.filter(l => {
        const term = this.search.trim().toLowerCase();
        if (!term) return true;
        return (
          l.subject.toLowerCase().includes(term) ||
          l.location.toLowerCase().includes(term) ||
          (l.instructor && l.instructor.toLowerCase().includes(term))
        );
      });

      if (this.filterLocation) out = out.filter(l => l.location === this.filterLocation);

      if (this.sortBy === 'price-asc') out.sort((a, b) => a.price - b.price);
      if (this.sortBy === 'price-desc') out.sort((a, b) => b.price - a.price);
      if (this.sortBy === 'spaces-desc') out.sort((a, b) => b.spaces - a.spaces);

      return out;
    },

    cartTotal() {
      return this.cart.reduce((s, i) => s + (i.price || 0), 0);
    },

    checkoutEnabled() {
      // ensure cart items still have spaces > 0 (edge case)
      return this.cart.length > 0 && this.cart.every(ci => {
        const lesson = this.lessons.find(l => l.id === ci.id);
        return lesson && ci._bookedTemp !== true; // reserved state not used here
      });
    }
  },

  methods: {
    // Fetch Lessons from backend
    fetchLessons() {
      const API_BASE = "http://localhost:3000";
      fetch(`${API_BASE}/api/lessons`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          return res.json();
        })
        .then(data => {
          this.lessons =data.map((l, idx) => ({
            id: l._id || idx + 1,
            subject: l.subject || 'No subject',
            location: l.location || 'Unknown',
            price: l.price || 0,
            spaces: l.spaces || 0,
            instructor: l.instructor || 'TBD',
            schedule: l.schedule || '',
            description: l.description || '',
            image: l.image || 'image/default.png'
          }));

          this.detailLesson = this.lessons[0] || {};
        })
        .catch(err => {
          console.error("Failed to fetch lessons:", err);
        });
    },

    // simple client-side login
    login() {
      this.loginError = '';
      const email = (this.loginForm.email || '').trim().toLowerCase();
      const password = this.loginForm.password || '';

      if (!email || !password) {
        this.loginError = 'Please provide email and password.';
        return;
      }
      // minimal client-side validation
      if (!/.+@.+\..+/.test(email)) {
        this.loginError = 'Please enter a valid email address.';
        return;
      }
      if (password.length < 3) {
        this.loginError = 'Password must be at least 3 characters.';
        return;
      }

      const found = this.presetUsers.find(u => u.email === email && u.password === password);
      if (!found) {
        this.loginError = 'Credentials not recognised (demo users shown below).';
        return;
      }

      // login success
      this.user = { id: found.id, name: found.name, email: found.email };
      // store in localStorage so page refresh keeps session in demo
      localStorage.setItem('bookstore_user', JSON.stringify(this.user));
      this.goTo('bookstore');

      // reset form
      this.loginForm.password = '';
    },

    // logout
    logout() {
      this.user = null;
      localStorage.removeItem('bookstore_user');
      this.goTo('login');
    },

    // change page
    goTo(p) {
      this.page = p;
      // small UX: clear login error when moving away
      this.loginError = '';
    },

    // add lesson to cart (decrement spaces)
    addToCart(lesson) {
      if (lesson.spaces === 0) return;
      // push a shallow copy to avoid mutating lesson object in cart removal later
      const item = { id: lesson.id, subject: lesson.subject, price: lesson.price, location: lesson.location, instructor: lesson.instructor };
      this.cart.push(item);
      // decrement available spaces in source
      const source = this.lessons.find(l => l.id === lesson.id);
      if (source) source.spaces = Math.max(0, source.spaces - 1);
      // ensure user is aware to login if not yet
      if (!this.user) {
        // not a blocking requirement, but encourage login
        setTimeout(() => {
          if (!this.user && confirm('You are booking as guest. Would you like to login or continue as guest?')) {
            this.goTo('login');
          }
        }, 250);
      }
    },

    // remove from cart (and increment spaces back)
    removeFromCart(idx) {
      const item = this.cart[idx];
      if (item) {
        const source = this.lessons.find(l => l.id === item.id);
        if (source) source.spaces = source.spaces + 1;
      }
      this.cart.splice(idx, 1);
    },

    // view details
    viewDetail(lesson) {
      this.detailLesson = lesson;
      this.goTo('detail');
    },

    // clear cart (and restore spaces)
    clearCart() {
      // restore spaces for each cart item
      this.cart.forEach(ci => {
        const source = this.lessons.find(l => l.id === ci.id);
        if (source) source.spaces = source.spaces + 1;
      });
      this.cart = [];
    },

    // checkout (client-side simulated)
    async checkout() {
      if (this.cart.length === 0) return;
      if (!this.user) {
        if (!confirm('You are not logged in. Bookings will be recorded only locally on this device. Continue?')) return;
      }
      this.checkoutLoading = true;
      // simulate network
      await new Promise(r => setTimeout(r, 800));

      // produce lastPurchase object
      this.lastPurchase = {
        items: this.cart.map(c => ({ subject: c.subject, price: c.price })),
        total: this.cart.reduce((s, i) => s + i.price, 0),
        at: new Date().toISOString()
      };

      // persist lastPurchase in localStorage (demo)
      localStorage.setItem('bookstore_lastPurchase', JSON.stringify(this.lastPurchase));

      // clear cart but DO NOT restore spaces (they are booked)
      this.cart = [];

      this.checkoutLoading = false;
      this.goTo('confirmation');
    },

    // load persisted session (demo)
    restoreFromStorage() {
      try {
        const u = localStorage.getItem('bookstore_user');
        if (u) this.user = JSON.parse(u);
        const lp = localStorage.getItem('bookstore_lastPurchase');
        if (lp) this.lastPurchase = JSON.parse(lp);
      } catch (e) {
        // ignore
      }
    }
  },

  created() {
    // restore any saved demo session
    this.restoreFromStorage();
    this.fetchLessons(); // fetch from backend
  }
}).mount('#app');