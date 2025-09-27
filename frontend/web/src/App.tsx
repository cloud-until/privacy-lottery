import React, { useEffect, useState } from "react";
import { getContractReadOnly, normAddr, ABI, config } from "./contract";
import { 
  FaClock, FaUsers, FaPlus, FaList, FaFire, FaTrophy, FaGift, FaRandom,
  FaShieldAlt, FaUserSecret, FaCheckCircle
} from "react-icons/fa";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import { ethers } from "ethers";
import "./App.css"

interface Lottery {
  id: number;
  creator: string;
  prizeDescription: string;
  deadline: number;
  state: number; // 0: Open, 1: Closed, 2: WinnerDrawn, 3: Completed
  participantsCount: number;
  winner?: string;
}

export default function App() {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [lotteries, setLotteries] = useState<Lottery[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [currentLottery, setCurrentLottery] = useState<Lottery | null>(null);

  useEffect(() => {
    loadLotteries().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  // ----------------- Load Lotteries -----------------
  const loadLotteries = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const lotteryCounter = await contract.lotteryCounter();
      const count = Number(lotteryCounter);
      
      const list: Lottery[] = [];
      const loadPromises: Promise<void>[] = [];
      
      for (let i = 0; i < count; i++) {
        loadPromises.push((async (id) => {
          try {
            const lottery = await contract.lotteries(id);
            const participantsCount = await contract.getParticipantsCount(id);
            
            list.push({
              id,
              creator: lottery.creator,
              prizeDescription: lottery.prizeDescription,
              deadline: Number(lottery.deadline),
              state: Number(lottery.state),
              participantsCount: Number(participantsCount),
              winner: lottery.winner
            });
          } catch (e) {
            console.error(`Error loading lottery ${id}:`, e);
          }
        })(i));
      }
      
      await Promise.all(loadPromises);
      
      list.sort((a, b) => b.id - a.id);
      setLotteries(list);
    } catch (e) {
      console.error("Error loading lotteries:", e);
    }
  };

  const createLottery = async (prizeDescription: string, deadline: number) => {
    if (!prizeDescription || deadline <= Date.now()/1000) { 
      alert("Please enter valid lottery details"); 
      return; 
    }
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    try {
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(config.contractAddress, ABI, signer);
      
      const tx = await contract.createLottery(
        prizeDescription, 
        deadline
      );
      await tx.wait();
      setShowCreateModal(false);
      await loadLotteries();
      alert("Lottery created successfully!");
    } catch (e: any) {
      alert("Creation failed: " + (e.message || "Unknown error"));
    } finally {
      setCreating(false);
    }
  };

  const participate = async (lotteryId: number) => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    try {
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(config.contractAddress, ABI, signer);
      
      const tx = await contract.enterLottery(lotteryId);
      await tx.wait();
      await loadLotteries();
      alert("Participation successful!");
    } catch (e: any) {
      alert("Participation failed: " + (e.message || "Unknown error"));
    }
  };

  const drawWinner = async (lotteryId: number) => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    try {
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(config.contractAddress, ABI, signer);
      
      const tx = await contract.drawWinner(lotteryId);
      await tx.wait();
      await loadLotteries();
      alert("Winner drawn successfully!");
    } catch (e: any) {
      alert("Failed to draw winner: " + (e.message || "Unknown error"));
    }
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Loading blockchain data...</p>
    </div>
  );

  // Filter lotteries based on active tab
  const filteredLotteries = lotteries.filter(lottery => {
    if (activeTab === "all") return true;
    if (activeTab === "active") return lottery.state === 0; // Open
    if (activeTab === "completed") return lottery.state === 3; // Completed
    return true;
  });

  // ----------------- Aggregate Stats -----------------
  const totalLotteries = lotteries.length;
  const totalParticipants = lotteries.reduce((sum, l) => sum + l.participantsCount, 0);
  const activeLotteryCount = lotteries.filter(l => l.state === 0).length;
  const completedLotteryCount = lotteries.filter(l => l.state === 3).length;

  return (
    <div className="app-container">
      {/* Animated background elements */}
      <div className="bg-particles">
        {[...Array(15)].map((_, i) => <div key={i} className="particle"></div>)}
      </div>
  
      {/* Navbar */}
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon"></div>
          <h1>Privacy<span>Lottery</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-lottery-btn"
          >
            <FaPlus /> New Lottery
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
  
      {/* Main Content */}
      <div className="main-content">
        {/* System Introduction */}
        <section className="intro-section">
          <div className="intro-content">
            <div className="intro-text">
              <h2>Privacy-First Lottery Platform</h2>
              <p>
                PrivacyLottery is a revolutionary platform that allows you to participate in 
                lotteries while keeping your identity completely private. 
                Using advanced cryptographic techniques, we ensure fair and transparent winner selection.
              </p>
              
              <div className="intro-features">
                <div className="feature">
                  <div className="feature-icon">
                    <FaShieldAlt />
                  </div>
                  <div>
                    <h3>Privacy Protection</h3>
                    <p>Your identity remains protected throughout the process</p>
                  </div>
                </div>
                
                <div className="feature">
                  <div className="feature-icon">
                    <FaRandom />
                  </div>
                  <div>
                    <h3>Fair Selection</h3>
                    <p>Winners selected using verifiable on-chain randomness</p>
                  </div>
                </div>
                
                <div className="feature">
                  <div className="feature-icon">
                    <FaUserSecret />
                  </div>
                  <div>
                    <h3>Simple Participation</h3>
                    <p>Participate with just a few clicks</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="intro-image">
              <div className="privacy-shield"></div>
            </div>
          </div>
        </section>
        
        {/* How It Works */}
        <section className="how-it-works">
          <h2>How PrivacyLottery Works</h2>
          
          <div className="steps">
            <div className="step">
              <div className="step-number">1</div>
              <div className="step-content">
                <h3>Create a Lottery</h3>
                <p>Set up a lottery with prize description and deadline</p>
              </div>
            </div>
            
            <div className="step">
              <div className="step-number">2</div>
              <div className="step-content">
                <h3>Participants Join</h3>
                <p>Users join with their wallet address</p>
              </div>
            </div>
            
            <div className="step">
              <div className="step-number">3</div>
              <div className="step-content">
                <h3>Draw Winner Securely</h3>
                <p>Random winner selected using on-chain randomness</p>
              </div>
            </div>
            
            <div className="step">
              <div className="step-number">4</div>
              <div className="step-content">
                <h3>Winner Revealed</h3>
                <p>Winner address is immediately revealed</p>
              </div>
            </div>
          </div>
        </section>

        <section className="dashboard-section">
          <div className="dashboard-stats">
            <div className="stat-card">
              <div className="stat-icon">
                <FaUsers />
              </div>
              <div className="stat-content">
                <h3>Total Participants</h3>
                <p>{totalParticipants}</p>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">
                <FaList />
              </div>
              <div className="stat-content">
                <h3>Total Lotteries</h3>
                <p>{totalLotteries}</p>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">
                <FaFire />
              </div>
              <div className="stat-content">
                <h3>Active Lotteries</h3>
                <p>{activeLotteryCount}</p>
              </div>
            </div>
            
            <div className="stat-card">
              <div className="stat-icon">
                <FaTrophy />
              </div>
              <div className="stat-content">
                <h3>Completed</h3>
                <p>{completedLotteryCount}</p>
              </div>
            </div>
          </div>
        </section>
        
        {/* Lottery Tabs */}
        <div className="auction-tabs">
          {[
            { id: "all", label: "All Lotteries", icon: <FaList /> },
            { id: "active", label: "Active", icon: <FaFire /> },
            { id: "completed", label: "Completed", icon: <FaCheckCircle /> }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
        
        {/* Lotteries Grid */}
        <div className="auctions-grid">
          {filteredLotteries.length === 0 ? (
            <div className="no-auctions">
              <h3>No lotteries found</h3>
              <p>Create the first lottery to get started!</p>
              <button 
                onClick={() => setShowCreateModal(true)} 
                className="create-first-btn"
              >
                Create First Lottery
              </button>
            </div>
          ) : (
            filteredLotteries.map(lottery => {
              const isCreator = account && normAddr(account) === normAddr(lottery.creator);
              const isActive = lottery.state === 0;
              const isCompleted = lottery.state === 3;
              
              return (
                <div key={lottery.id} className="auction-card">
                  <div className="auction-header">
                    <div>
                      <h3>Lottery #{lottery.id}</h3>
                      <p className="creator">
                        by {lottery.creator.substring(0, 6)}...{lottery.creator.substring(lottery.creator.length - 4)}
                      </p>
                    </div>
                    <div className={`status-badge ${
                      isCompleted ? 'completed' : 'active'
                    }`}>
                      {isCompleted ? "COMPLETED" : "ACTIVE"}
                    </div>
                  </div>
                  
                  <div className="prize-description">
                    <FaGift /> {lottery.prizeDescription}
                  </div>
                  
                  <div className="auction-stats">
                    <div className="stat">
                      <FaClock size={14} />
                      <span>Deadline: {new Date(lottery.deadline * 1000).toLocaleString()}</span>
                    </div>
                    <div className="stat">
                      <FaUsers size={14} />
                      <span>{lottery.participantsCount} participants</span>
                    </div>
                    {isCompleted && lottery.winner && (
                      <div className="stat">
                        <FaTrophy size={14} />
                        <span>Winner: {lottery.winner.substring(0, 6)}...{lottery.winner.substring(lottery.winner.length - 4)}</span>
                      </div>
                    )}
                  </div>
                  
                  {isCompleted && lottery.winner && (
                    <div className="winner-info">
                      <FaTrophy />
                      <div>
                        <span>Winner</span>
                        <strong>{lottery.winner.substring(0, 6)}...{lottery.winner.substring(lottery.winner.length - 4)}</strong>
                      </div>
                    </div>
                  )}
                  
                  <div className="auction-actions">
                    {isActive && account && (
                      <button 
                        onClick={() => participate(lottery.id)} 
                        className="participate-btn"
                      >
                        Participate
                      </button>
                    )}
                    
                    {isCreator && isActive && (
                      <button 
                        onClick={() => drawWinner(lottery.id)}
                        className="draw-btn"
                      >
                        <FaRandom size={12} /> Draw Winner
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
  
      {/* Modals */}
      {showCreateModal && (
        <ModalCreate 
          onCreate={createLottery} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating} 
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
  
      <footer className="app-footer">
        <p>Privacy Protected Lottery Platform &copy; {new Date().getFullYear()} - Built on Ethereum</p>
        <div className="footer-links">
          <a href="#">Docs</a>
          <a href="#">GitHub</a>
          <a href="#">Twitter</a>
          <a href="#">Discord</a>
        </div>
      </footer>
    </div>
  );
}

// ------------------- Create Lottery Modal -------------------
function ModalCreate({ onCreate, onClose, creating }: { 
  onCreate: (prizeDescription: string, deadline: number) => void; 
  onClose: () => void; 
  creating: boolean; 
}) {
  const [prizeDescription, setPrizeDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleSubmit = () => {
    if (!prizeDescription || !deadline) {
      alert("Please fill all fields");
      return;
    }
    
    const deadlineTimestamp = Math.floor(new Date(deadline).getTime() / 1000);
    if (deadlineTimestamp <= Math.floor(Date.now() / 1000)) {
      alert("Deadline must be in the future");
      return;
    }
    
    onCreate(prizeDescription, deadlineTimestamp);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDeadline(e.target.value);
    setShowDatePicker(false);
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Create New Lottery</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="form-group">
            <label>Prize Description</label>
            <textarea 
              value={prizeDescription} 
              onChange={e => setPrizeDescription(e.target.value)} 
              placeholder="Describe the prize..." 
              className="form-input"
              rows={3}
            />
          </div>
          
          <div className="form-group">
            <label>Deadline</label>
            <div className="datetime-input-container">
              <input 
                type="text"
                value={deadline} 
                onClick={() => setShowDatePicker(!showDatePicker)}
                placeholder="Select date and time"
                className="form-input"
                readOnly
              />
              {showDatePicker && (
                <div className="datetime-picker">
                  <input 
                    type="datetime-local" 
                    value={deadline} 
                    onChange={handleDateChange}
                    className="datetime-input"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="create-btn"
          >
            {creating ? "Creating..." : "Create Lottery"}
          </button>
        </div>
      </div>
    </div>
  );
}