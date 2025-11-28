// Drop this in the same folder as index.html and styles.css
const { createApp } = Vue;

// CREATE AND ASSIGN THE APP IN ONE PLACE 
const app = createApp({
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
          l.subject?.toLowerCase().includes(term) ||
          l.location?.toLowerCase().includes(term) ||
          l.instructor?.toLowerCase().includes(term) ||
          l.description?.toLowerCase().includes(term)
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
      return this.cart.length > 0 &&
        this.cart.every(ci => {
          const lesson = this.lessons.find(l => l._id === ci._id);
          return lesson && lesson.spaces >= 0;
        });
    }
  },

  methods: {
    // For local testing use
    apiBase() {
      return "http://localhost:3000";
    },

    // Fetch Lessons from backend
    fetchLessons() {
      const API_BASE = this.apiBase();

      return fetch(`${API_BASE}/api/lessons`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP error ${res.status}`);
          return res.json();
        })
        .then(data => {
          console.log("LESSONS FROM BACKEND:", data);

          this.lessons = data.map(l => ({
            _id: String(l._id),
            subject: l.subject || "No subject",
            location: l.location || "Unknown",
            price: Number(l.price) || 0,
            spaces: Number(l.spaces) || 0,
            instructor: l.instructor || "TBD",
            schedule: l.schedule || "",
            description: l.description || "",
            image: `${API_BASE}/image/${l.image && l.image.trim() !== "" ? l.image : "default.jpg"}`
          }));
        
        // default lesson to show in detail view
        this.detailLesson = this.lessons[0] || {};
        })
        .catch(err => {
          console.error("Failed to fetch lessons:", err);
          throw err;
        });
    },

    // simple client-side login
    login() {
      this.loginError = '';
      const email = this.loginForm.email.trim().toLowerCase();
      const password = this.loginForm.password;

      if (!email || !password) {
        this.loginError = 'Please provide email and password.';
        return;
      }


      const found = this.presetUsers.find(u => u.email === email && u.password === password);

      if (!found) {
        this.loginError = 'Credentials not recognised.';
        return;
      }


      this.user = { id: found.id, name: found.name, email: found.email };

      localStorage.setItem('bookstore_user', JSON.stringify(this.user));

      
      this.loginForm.password = '';
      this.goTo('bookstore');
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

      this.loginError = '';
    },

    // add lesson to cart
    addToCart(lesson) {
      if (lesson.spaces === 0) return;

      this.cart.push({
        _id: lesson._id,
        subject: lesson.subject,
        price: lesson.price,
        location: lesson.location,
        instructor: lesson.instructor
      });

      const src = this.lessons.find(l => l._id === lesson._id);
      if (src) src.spaces = Math.max(0, src.spaces - 1);
    },

    // remove from cart
    removeFromCart(idx) {
      const item = this.cart[idx];

      if (item) {
        const source = this.lessons.find(l => l._id === item._id);
        if (source) source.spaces++;
      }

      this.cart.splice(idx, 1);
    },

    // view details
    viewDetail(lesson) {
      this.detailLesson = lesson;
      this.goTo('detail');
    },

    // clear cart 
    clearCart() {
      // restore spaces for each cart item
      this.cart.forEach(ci => {
        const source = this.lessons.find(l => l._id === ci._id);
        if (source) source.spaces++;
      });

      this.cart = [];
    },
    
    // checkout: validate name/phone, POST order, then PUT lesson updates
    async checkout() {
      if (this.cart.length === 0) return alert("Cart is empty");
      // prompt for name & phone 
      const name = prompt("Enter your full name (letters only):", this.user ? this.user.name : "");
      const phone = prompt("Enter phone (numbers only):", "");

      // ----- VALIDATE NAME -----
      if (!name || !/^[A-Za-z\s]{2,}$/.test(name.trim())) {
        alert("Please enter a valid name (letters only, min 2 characters).");
        return;
      }

      // ----- VALIDATE PHONE -----
      if (!phone || !/^[0-9]{7,}$/.test(phone.trim())) {
        alert("Please enter a valid phone number (numbers only, min 7 digits).");
        return;
      }   

      const API_BASE = this.apiBase();
      this.checkoutLoading = true;

      //build aggregated items : count quantities by lesson id
      const aggregate = {};
      this.cart.forEach(ci => {
        aggregate[ci._id] = aggregate[ci._id] || {lessonId: ci._id, price: ci.price, quantity: 0, subject: ci.subject };
        aggregate[ci._id].quantity +=1;
      });

      const items = Object.values(aggregate);
      const totalPrice = items.reduce((s, it) => s + (it.price * it.quantity), 0);

      // prepare order payload
      const orderPayload = { name, phone, items: items.map(i => ({ lessonId: i.lessonId, quantity: i.quantity, price: i.price})), totalPrice };

      this.checkoutLoading = true;

      // POST the order
      fetch(`${API_BASE}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload)
      })
      .then(res => {
        if (!res.ok) return res.json().then(e => Promise.reject(e));
        return res.json();
      })
      .then(orderResult => {
        // For eachh aggregated item, compute and persist new spaces using PUT  
        const updates = items.map(it => {
          const clientLesson = this.lessons.find(l => l._id === it.lessonId);
          const clientNewSpaces = clientLesson ? clientLesson.spaces : 0;
          return fetch(`${API_BASE}/api/lessons/${it.lessonId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ spaces: clientNewSpaces })
          })
          .then(r => {
            if (!r.ok) return r.json().then(e => Promise.reject(e));
            return r.json();
          });
        });
        
        // Waiting for update to finish
        return Promise.all(updates).then(() => orderResult);
      })
      .then(orderResult => {
        // refresh lessons from server to get authorize state
        return this.fetchLessons().then(() => orderResult);
      })
      .then(orderResult => {
        // success: clear cart and show confirmation
        this.lastPurchase = { items: items.map(i => ({ subject: i.subject, price: i.price, qty: i.quantity })), total: totalPrice, orderId: orderResult.insertedId || orderResult.insertedId };
        localStorage.setItem('bookstore_lastPurchase', JSON.stringify(this.lastPurchase));
        this.cart = [];
        this.checkoutLoading = false;
        this.goTo('confirmation');
      })
      .catch(err => {
        console.error("checkout failed:", err);
        alert("Checkout failed. See console for details.");
        this.checkoutLoading = false;
      });
    },

    restoreFromStorage() {
      try {
        const u = localStorage.getItem('bookstore_user');
        if (u) this.user = JSON.parse(u);

        const lp = localStorage.getItem('bookstore_lastPurchase');
        if (lp) this.lastPurchase = JSON.parse(lp);
      } catch (e) {}
    }
  },

  created() {

    this.restoreFromStorage();
    this.fetchLessons();
  }

});

// CORRECT GLOBAL ASSIGNMENT 
window.app = app;
app.mount('#app');


