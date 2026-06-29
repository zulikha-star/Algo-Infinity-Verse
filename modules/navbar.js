// modules/navbar.js

let scrollPosition = 0;

function lockBodyScroll() {
  scrollPosition = window.scrollY;

  document.body.style.position = "fixed";
  document.body.style.top = `-${scrollPosition}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}

function unlockBodyScroll() {
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";

  window.scrollTo(0, scrollPosition);
}

// Function to close mobile menu - ADD THIS NEW FUNCTION
function closeMobileMenu() {
  const navLinks = document.getElementById("navLinks");
  const menuToggle = document.getElementById("menuToggle");
  const overlay = document.querySelector(".nav-overlay");
  
  if (navLinks && navLinks.classList.contains("active")) {
    navLinks.classList.remove("active");
    if (menuToggle) {
      menuToggle.setAttribute("aria-expanded", "false");
      const icon = menuToggle.querySelector("i");
      if (icon) {
        icon.classList.remove("fa-times");
        icon.classList.add("fa-bars");
      }
    }
    if (overlay) {
      overlay.classList.remove("active");
    }
    unlockBodyScroll();
  }
}

export function initNavbar() {
  const menuToggle = document.getElementById("menuToggle");
  const navLinks = document.getElementById("navLinks");

  let overlay = document.querySelector(".nav-overlay");
  if (!overlay && menuToggle && navLinks) {
    overlay = document.createElement("div");
    overlay.className = "nav-overlay";
    document.body.appendChild(overlay);
  }

  const toggleMenu = (open) => {
    const isOpen = open !== undefined ? open : !navLinks.classList.contains("active");
    navLinks.classList.toggle("active", isOpen);
    if (menuToggle) {
      menuToggle.setAttribute("aria-expanded", isOpen);
    }
    if (overlay) {
      overlay.classList.toggle("active", isOpen);
    }
    if (isOpen) {
      lockBodyScroll();
    } else {
      unlockBodyScroll();
    }

    if (menuToggle) {
      const icon = menuToggle.querySelector("i");
      if (icon) {
        icon.classList.toggle("fa-bars", !isOpen);
        icon.classList.toggle("fa-times", isOpen);
      }
    }
  };

  // FIXED: This now properly closes the menu
  const closeMenu = () => {
    if (!navLinks.classList.contains("active")) return;
    toggleMenu(false);
  };

  if (menuToggle && navLinks) {
    // Toggle menu on hamburger click
    menuToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    // Close menu on overlay click
    if (overlay) {
      overlay.addEventListener("click", closeMenu);
    }

    // FIX: Close menu on ALL navigation link clicks
    // This includes both desktop and mobile nav links
    const allNavLinks = document.querySelectorAll('.nav-link, .dropdown-item, .mobile-nav-link');
    allNavLinks.forEach((link) => {
      link.addEventListener("click", closeMenu);
    });

    // Also close when clicking any link inside navLinks
    navLinks.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeMenu);
    });

    // Close menu on ESC key - NEW
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeMenu();
      }
    });

    // Close menu on window resize (if going from mobile to desktop) - NEW
    window.addEventListener("resize", () => {
      if (window.innerWidth > 1024 && navLinks.classList.contains("active")) {
        closeMenu();
      }
    });
  }

  initDropdowns();
}

function initDropdowns() {
  const dropdownToggles = document.querySelectorAll(".dropdown-toggle");
  const isMobile = () => window.matchMedia("(max-width: 1024px)").matches;

  dropdownToggles.forEach((toggle) => {
    const parent = toggle.closest(".has-dropdown");
    const menu = parent?.querySelector(".dropdown-menu");

    if (!parent || !menu) return;

    // Clean up any existing listeners to prevent duplicates
    const newToggle = toggle.cloneNode(true);
    toggle.parentNode.replaceChild(newToggle, toggle);
    
    // Re-fetch the toggle reference
    const freshToggle = newToggle;
    const freshParent = freshToggle.closest(".has-dropdown");
    const freshMenu = freshParent?.querySelector(".dropdown-menu");

    if (isMobile()) {
      freshToggle.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Close other open dropdowns
        document.querySelectorAll(".has-dropdown.open").forEach((el) => {
          if (el !== freshParent) {
            el.classList.remove("open");
            const toggleBtn = el.querySelector(".dropdown-toggle");
            if (toggleBtn) {
              toggleBtn.setAttribute("aria-expanded", "false");
            }
          }
        });

        const isOpen = freshParent.classList.toggle("open");
        freshToggle.setAttribute("aria-expanded", isOpen);
      });
    } else {
      let hoverTimeout;

      const showMenu = () => {
        clearTimeout(hoverTimeout);
        freshParent.classList.add("open");
        freshToggle.setAttribute("aria-expanded", "true");
      };

      const hideMenu = () => {
        hoverTimeout = setTimeout(() => {
          freshParent.classList.remove("open");
          freshToggle.setAttribute("aria-expanded", "false");
        }, 250);
      };

      freshParent.addEventListener("mouseenter", showMenu);
      freshParent.addEventListener("mouseleave", hideMenu);

      freshToggle.addEventListener("focus", showMenu);
      freshMenu.addEventListener("focusin", showMenu);
      freshParent.addEventListener("focusout", hideMenu);

      freshToggle.addEventListener("click", (e) => {
        if (isMobile()) {
          e.preventDefault();
          const isOpen = freshParent.classList.toggle("open");
          freshToggle.setAttribute("aria-expanded", isOpen);
        }
      });
    }

    // Close dropdown when clicking a dropdown item
    freshMenu.querySelectorAll(".dropdown-item").forEach((item) => {
      item.addEventListener("click", () => {
        if (isMobile()) {
          freshParent.classList.remove("open");
          freshToggle.setAttribute("aria-expanded", "false");
        }
      });
    });
  });

  window.addEventListener("resize", () => {
    if (!isMobile()) {
      document.querySelectorAll(".has-dropdown.open").forEach((el) => {
        el.classList.remove("open");
      });
      dropdownToggles.forEach((toggle) => {
        toggle.setAttribute("aria-expanded", "false");
      });
    }
  });
}

// Export all functions
export { initNavbar, closeMobileMenu, lockBodyScroll, unlockBodyScroll };