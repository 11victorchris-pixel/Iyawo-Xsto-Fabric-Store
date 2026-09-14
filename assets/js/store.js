const menuButton = document.querySelector('[data-menu-button]');
const mobileMenu = document.querySelector('[data-mobile-menu]');
const toast = document.querySelector('[data-toast]');

menuButton?.addEventListener('click', () => {
  const isOpen = mobileMenu.classList.toggle('is-open');
  menuButton.setAttribute('aria-expanded', String(isOpen));
});

document.querySelectorAll('[data-mobile-link]').forEach((link) => {
  link.addEventListener('click', () => mobileMenu?.classList.remove('is-open'));
});

document.querySelectorAll('[data-add-cart]').forEach((button) => {
  button.addEventListener('click', () => {
    if (!toast) return;
    toast.textContent = `${button.dataset.addCart} added to your selection`;
    toast.classList.add('is-visible');
    window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
  });
});

const filterButtons = document.querySelectorAll('[data-filter]');
const products = document.querySelectorAll('[data-category]');
filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    filterButtons.forEach((item) => item.classList.remove('bg-forest', 'text-white'));
    button.classList.add('bg-forest', 'text-white');
    const filter = button.dataset.filter;
    products.forEach((product) => {
      product.hidden = filter !== 'all' && product.dataset.category !== filter;
    });
  });
});
