import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  ChevronLeft, Users, Image as ImageIcon, 
  Info, X, XCircle, CheckCircle, AlertCircle, Loader2
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import {
  saveEventCatering,
  updateEventBookingCateringTotals
} from '@/services/firebase-services';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import './EventCatering.css';

interface CateringItem {
  id: string;
  name: string;
  pricePerPerson: number;
  minPeople: number;
  images: string[];
  description: string;
  menuDetails: string[];
}

interface SelectedItemState {
  headcount: number;
  dietaryNotes: string;
}

const CATERING_OPTIONS: CateringItem[] = [
  {
    id: 'spit-braai-trad',
    name: 'Traditional Spit Braai',
    pricePerPerson: 200,
    minPeople: 25,
    images: [
      '/catering/highlands braai combo 1.jpg',
      '/catering/highlands braai combo 2.jpg',
      '/catering/highlands braai combo 3.jpg',
      '/catering/highlands braai combo 4.jpg',
    ],
    description: 'Traditional Lamb on the Spit – basted in our secret marinade.',
    menuDetails: [
      'Served with Home Made Mint Sauce',
      'Choice of One: Spit Braai baby Potatoes, Lemon & Rosemary Potato Wedges, Garlic & Parsley Baby Potatoes, Garlic Hasselback Potatoes, Pap & Chakalaka, Phutu Pap & Sauce',
      'Choice of Two Salads: Greek, Pasta, Curried Pasta, Curried Rice, Coleslaw, 3 Bean, Potato with egg, Honey Dijon Baby Potato, Butternut/Feta/Rocket, Chinese Cabbage, Broccoli & Bacon, Beetroot/Feta/Rocket, Asian Slaw',
      'Choice of One Bread: Knotted Cocktail Rolls & Butter (2 each), Crispy Round Roll & Butter (1 each), Garlic Bread'
    ]
  },
  {
    id: 'spit-braai-chicken',
    name: 'Chicken & Spit Braai',
    pricePerPerson: 220,
    minPeople: 25,
    images: [
      '/catering/the william wallace combo 1.jpg',
      '/catering/the william wallace combo 2.jpg',
      '/catering/the william wallace combo 3.jpg',
    ],
    description: 'Traditional Lamb & Lemon & Herb Chicken Pieces.',
    menuDetails: [
      'Traditional Lamb on the Spit – basted in our secret marinade',
      'Lemon & Herb Chicken Pieces - cooked in the spit',
      'Served with Home Made Mint Sauce',
      'Choice of One: Spit Braai baby Potatoes, Lemon & Rosemary Potato Wedges, Garlic Hasselback Potatoes, Garlic & Parsley Baby Potatoes, Pap & Chakalaka, Phutu Pap & Sauce',
      'Choice of Two Salads: Greek, Pasta, Curried Pasta, Curried Rice, Coleslaw, 3 Bean, Potato with Egg, Honey Dijon Baby Potato, Butternut/Feta/Olive/Rocket, Chinese Cabbage, Broccoli & Bacon, Beetroot/Feta/Rocket, Asian Slaw',
      'Choice of One Bread: Knotted Cocktail Rolls & Butter (2 each), Crispy Round Roll & Butter (1 each), Garlic Bread Loaves'
    ]
  },
  {
    id: 'wedding-canapes',
    name: 'Wedding Bells Canapes',
    pricePerPerson: 150,
    minPeople: 20,
    images: [
      '/catering/wedding bells canapes 1.jpg',
      '/catering/wedding bells canapes 2.jpg',
      '/catering/wedding bells canapes 3.jpg',
    ],
    description: 'Elegant bite-sized starters to welcome your guests.',
    menuDetails: [
      "Chef's selection of premium hot and cold canapes",
      'Includes vegetarian, beef, and seafood options',
      'Served on arrival as a welcome snack'
    ]
  },
  {
    id: 'wedding-package',
    name: 'Wedding Bells Three Package',
    pricePerPerson: 350,
    minPeople: 20,
    images: [
      '/catering/wedding bells three package 2.jpg',
      '/catering/wedding bells three package 3.jpg',
      '/catering/wedding bells three package 4.jpg',
      '/catering/wedding bells three package 5.jpg',
    ],
    description: 'A comprehensive premium dining experience for your special day.',
    menuDetails: [
      'Plated Starter: Choice of soup or fresh seasonal salad',
      'Main Course: Choice of two premium meats (Beef Fillet, Kingklip, or Chicken Roulade)',
      'Served with seasonal roasted vegetables and savory rice',
      'Vegetarian alternative available upon request'
    ]
  },
  {
    id: 'two-desserts',
    name: 'Two Dessert Selection',
    pricePerPerson: 85,
    minPeople: 20,
    images: [
      '/catering/two desserts selection 1.jpg',
      '/catering/two desserts selection 2.jpg',
      '/catering/two desserts selection 3.jpg',
    ],
    description: 'A sweet conclusion to your event with traditional favorites.',
    menuDetails: [
      'Traditional South African Malva Pudding with warm custard',
      'Decadent Peppermint Crisp Tart',
      'Accompanied by seasonal fruit skewers'
    ]
  },
  {
    id: 'mixed-beverages',
    name: 'Mixed Beverages & Soft Drinks',
    pricePerPerson: 65,
    minPeople: 10,
    images: [
      '/catering/mixed beverages and soft drinks 1.jpg',
      '/catering/mixed beverages and soft drinks 2.jpg',
      '/catering/mixed beverages and soft drinks 3.jpg',
    ],
    description: 'Refreshing assorted beverages served on ice.',
    menuDetails: [
      'Assorted 300ml sodas (Coke, Sprite, Fanta)',
      '100% Fruit Juice selections',
      'Still and Sparkling Mineral Water',
      'Served from a self-service iced beverage station'
    ]
  }
];

export default function EventCateringWeb() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const { expectedAttendance = 30, bookingId, maxCapacity } = location.state || {};

  // Hard cap = the venue's max capacity from the event booking (falls back to the largest venue)
  const capacityCap = typeof maxCapacity === 'number' && maxCapacity > 0 ? maxCapacity : 400;

  // Ownership validation (mobile-compatible): only the guest who owns the
  // booking may attach catering to it.
  const [bookingError, setBookingError] = useState('');
  const [isValidating, setIsValidating] = useState(true);

  useEffect(() => {
    const validateBooking = async () => {
      if (!bookingId) {
        setBookingError('No booking reference found. Returning to dashboard.');
        setIsValidating(false);
        return;
      }
      try {
        const user = auth.currentUser;
        const snap = await getDoc(doc(db, 'event_bookings', bookingId));
        if (!snap.exists()) {
          setBookingError('Event booking not found. It may have been removed.');
        } else if (user && snap.data().guestId && snap.data().guestId !== user.uid) {
          setBookingError('You do not have permission to add catering to this event.');
        }
      } catch (err) {
        console.error('Booking validation failed:', err);
        setBookingError('Could not validate the event booking. Please try again.');
      } finally {
        setIsValidating(false);
      }
    };
    validateBooking();
  }, [bookingId]);

  // Aligned with Flow 4 & 5: Tracks headcount and dietary needs per package
  const [selectedItems, setSelectedItems] = useState<Record<string, SelectedItemState>>({});
  const [activeGalleryImages, setActiveGalleryImages] = useState<string[] | null>(null);
  const [activeInfoItem, setActiveInfoItem] = useState<CateringItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleSelection = (item: CateringItem) => {
    setSelectedItems(prev => {
      const newSelections = { ...prev };
      if (newSelections[item.id]) {
        delete newSelections[item.id];
      } else {
        // Automatically pre-populates with saved venue headcount, bounded by package minimum and venue capacity
        newSelections[item.id] = {
          headcount: Math.min(Math.max(expectedAttendance, item.minPeople), capacityCap),
          dietaryNotes: ''
        };
      }
      return newSelections;
    });
  };

  const updateItemDetail = (id: string, field: keyof SelectedItemState, value: string | number) => {
    setSelectedItems(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  const calculateTotal = () => {
    let total = 0;
    CATERING_OPTIONS.forEach(item => {
      if (selectedItems[item.id]) {
        total += item.pricePerPerson * selectedItems[item.id].headcount;
      }
    });
    return total;
  };

  const handleFinalize = async () => {
    const total = calculateTotal();
    
    if (total === 0) {
      navigate('/');
      return;
    }

    if (!bookingId) {
      window.alert("Error: No booking reference found. Returning to dashboard.");
      navigate('/');
      return;
    }

    if (bookingError) {
      window.alert(bookingError);
      navigate('/');
      return;
    }

    setIsSubmitting(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        window.alert("Please sign in to book catering.");
        navigate('/login');
        return;
      }

      const selected = CATERING_OPTIONS.filter(item => selectedItems[item.id]);

      // 1) Mobile-compatible upsert into the event_caterings collection
      await saveEventCatering({
        guestId: currentUser.uid,
        bookingId,
        expectedAttendance,
        items: selected.map(item => ({
          id: item.id,
          name: item.name,
          pricePerPerson: item.pricePerPerson,
          quantity: selectedItems[item.id].headcount,
          total: item.pricePerPerson * selectedItems[item.id].headcount,
        })),
        totalAmount: total,
      });

      // 2) Keep the booking totals in sync (combined total, deposit, balance)
      const totals = await updateEventBookingCateringTotals(bookingId, {
        expectedAttendance,
        cateringTotal: total,
      });

      // 3) Backward-compatible inline summary for the web financial card
      const savedCateringItems = selected.map(item => ({
        name: item.name,
        pricePerPerson: item.pricePerPerson,
        guestsCovered: selectedItems[item.id].headcount,
        dietaryRequirements: selectedItems[item.id].dietaryNotes,
        itemTotal: item.pricePerPerson * selectedItems[item.id].headcount
      }));
      await updateDoc(doc(db, 'event_bookings', bookingId), {
        cateringTotal: total,
        cateringItems: savedCateringItems
      });

      const venueCost = totals.combinedTotal - total;

      const goPay = (mode?: string) =>
        navigate('/payment', {
          state: {
            bookingDetails: {
              bookingId,
              expectedAttendance,
              maxCapacity: capacityCap,
            },
            paymentMode: mode,
          }
        });

      if (totals.balanceDue <= 0) {
        window.alert(
          `Catering Saved!\n\nYour combined event total is R ${totals.combinedTotal.toLocaleString()} — fully covered by your previous payments.\n\nVenue: R ${venueCost.toLocaleString()}\nCatering: R ${total.toLocaleString()}\nAlready paid: R ${totals.amountPaid.toLocaleString()}\nBalance due: R 0`
        );
        navigate('/');
        return;
      }

      if (totals.amountPaid > 0) {
        const goNow = window.confirm(
          `Catering Saved — Balance Updated!\n\nCombined total: R ${totals.combinedTotal.toLocaleString()}\nAlready paid: R ${totals.amountPaid.toLocaleString()}\nNew balance due: R ${totals.balanceDue.toLocaleString()}\n\nPay the updated balance now, or settle it later from My Events.`
        );
        if (goNow) goPay();
        else navigate('/');
        return;
      }

      const choice = window.prompt(
        `Catering Added to Your Event!\n\nCombined event total: R ${totals.combinedTotal.toLocaleString()}\nDeposit (50%): R ${totals.depositRequired.toLocaleString()}\n\nThis one payment covers your venue AND catering together.\n\nType 1 = Pay Deposit Now\nType 2 = Pay In Full\n(Anything else = Later)`,
        '1'
      );
      if (choice === '1') goPay();
      else if (choice === '2') goPay('full');
      else navigate('/');

    } catch (error) {
      console.error("Error saving catering:", error);
      window.alert("There was an issue saving your catering options. Please contact the front desk.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ec-container">
      {/* HEADER */}
      <header className="ec-header">
        <button className="ec-back-button" onClick={() => navigate(-1)}>
          <ChevronLeft size={28} color="#1e3a5f" />
        </button>
        <h1 className="ec-header-title">Event Catering</h1>
        <div style={{ width: '28px' }} />
      </header>

      <main className="ec-scroll-content">
        <div className="ec-guest-count-badge">
          <Users size={20} color="#d97706" />
          <span className="ec-guest-count-text">Venue Capacity Booked: {expectedAttendance} Guests (Max {capacityCap})</span>
        </div>

        {CATERING_OPTIONS.map((item) => {
          const selectedData = selectedItems[item.id];
          const isSelected = !!selectedData;
          const itemTotal = isSelected ? (item.pricePerPerson * selectedData.headcount) : 0;

          return (
            <div key={item.id} className={`ec-card ${isSelected ? 'ec-card-selected' : ''}`}>
              <div 
                className="ec-image-container"
                onClick={() => setActiveGalleryImages(item.images)}
              >
                <img src={item.images[0]} alt={item.name} className="ec-card-image" />
                <div className="ec-gallery-badge">
                  <ImageIcon size={14} color="#fff" />
                  <span className="ec-gallery-badge-text">1/{item.images.length}</span>
                </div>
              </div>

              <div className="ec-card-body">
                <div className="ec-card-header">
                  <h2 className="ec-item-title">{item.name}</h2>
                  <span className="ec-item-price">R{item.pricePerPerson} pp</span>
                </div>
                
                <p className="ec-item-desc">{item.description}</p>
                
                <div className="ec-action-row">
                  <button 
                    className="ec-info-btn"
                    onClick={() => setActiveInfoItem(item)}
                  >
                    <Info size={18} color="#1e3a5f" />
                    <span className="ec-info-btn-text">View Menu</span>
                  </button>

                  <button 
                    className={`ec-add-btn ${isSelected ? 'ec-add-btn-selected' : ''}`}
                    onClick={() => toggleSelection(item)}
                  >
                    <span className={`ec-add-btn-text ${isSelected ? 'ec-add-btn-text-selected' : ''}`}>
                      {isSelected ? 'Remove' : 'Select'}
                    </span>
                  </button>
                </div>
                
                {/* SRS Flow 4 & 5 Customization Block */}
                {isSelected && (
                  <div style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                    
                    {/* Headcount Adjuster */}
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1e3a5f', marginBottom: '6px' }}>
                        Adjust Headcount (Minimum: {item.minPeople} | Maximum: {capacityCap})
                      </label>
                      <input
                        type="number"
                        min={item.minPeople}
                        max={capacityCap}
                        value={selectedData.headcount}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          updateItemDetail(item.id, 'headcount', isNaN(val) ? item.minPeople : Math.min(Math.max(val, item.minPeople), capacityCap));
                        }}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #94a3b8', fontSize: '14px' }}
                      />
                      <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#64748b' }}>
                        Headcount cannot exceed the venue capacity of {capacityCap} guests.
                      </p>
                    </div>

                    {/* Dietary Requirements */}
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1e3a5f', marginBottom: '6px' }}>
                        Dietary Requirements & Quantities
                      </label>
                      <textarea
                        placeholder="e.g., 2 Vegan, 1 Gluten-Free, 1 Halal"
                        value={selectedData.dietaryNotes}
                        onChange={(e) => updateItemDetail(item.id, 'dietaryNotes', e.target.value)}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #94a3b8', minHeight: '65px', fontSize: '14px', resize: 'vertical' }}
                      />
                    </div>

                    <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#475569' }}>Item Total:</span>
                      <span style={{ fontSize: '16px', fontWeight: 700, color: '#1e3a5f' }}>R {itemTotal.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </main>

      <footer className="ec-bottom-bar">
        <div>
          <p className="ec-bottom-total-label">Catering Total</p>
          <p className="ec-bottom-total-value">R {calculateTotal().toLocaleString()}</p>
        </div>
        <button 
          className="ec-checkout-btn" 
          onClick={handleFinalize}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
             <Loader2 className="animate-spin" size={24} color="#fff" />
          ) : (
             "Complete Booking"
          )}
        </button>
      </footer>

      {/* MODALS */}
      {activeGalleryImages && (
        <div className="ec-modal-dark-overlay">
          <button 
            className="ec-close-gallery-btn" 
            onClick={() => setActiveGalleryImages(null)}
          >
            <XCircle size={40} color="#fff" />
          </button>
          
          <div className="ec-gallery-scroll">
            {activeGalleryImages.map((img, index) => (
              <div key={index} className="ec-gallery-slide">
                <img src={img} alt="Gallery view" className="ec-full-screen-image" />
              </div>
            ))}
          </div>
        </div>
      )}

      {activeInfoItem && (
        <div className="ec-modal-overlay">
          <div className="ec-info-modal-card">
            <div className="ec-info-modal-header">
              <h2 className="ec-info-modal-title">{activeInfoItem.name}</h2>
              <button className="ec-close-btn" onClick={() => setActiveInfoItem(null)}>
                <X size={28} color="#64748b" />
              </button>
            </div>
            
            <div className="ec-info-scroll-content">
              <h3 className="ec-info-modal-sub">Menu Inclusions & Choices:</h3>
              
              {activeInfoItem.menuDetails.map((detail, index) => (
                <div key={index} className="ec-menu-detail-row">
                  <CheckCircle size={18} color="#c9a227" className="ec-detail-icon" />
                  <p className="ec-menu-detail-text">{detail}</p>
                </div>
              ))}
              
              <div className="ec-minimum-notice">
                <AlertCircle size={16} color="#b45309" />
                <span className="ec-minimum-notice-text">
                  Requires a minimum order for {activeInfoItem.minPeople} people.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}