// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract PrivacyLotteryFHE is SepoliaConfig {
    // Enum representing different states of a lottery
    enum LotteryState { Open, WinnerDrawn, Completed }
    
    // Structure to store lottery details
    struct Lottery {
        address creator;           // Address of lottery creator
        string prizeDescription;    // Text description of the prize
        uint256 deadline;           // Timestamp when lottery closes
        LotteryState state;         // Current state of the lottery
        
        // Encrypted state variables
        euint32 encryptedParticipantCount; // Encrypted count of participants
        euint32 encryptedRandomSeed;      // Encrypted random seed for selection
        
        // Decrypted values (after winner reveal)
        address winner;             // Address of the winner
        uint32 decryptedWinnerIndex; // Decrypted winner index
    }
    
    // Participant status tracking
    struct Participant {
        bytes32 commitmentHash;     // Hash of the commitment
        bool isRevealed;            // Whether participant has revealed
    }
    
    // Contract state
    mapping(uint256 => Lottery) public lotteries;
    mapping(uint256 => mapping(address => Participant)) public participants;
    mapping(uint256 => address[]) public participantAddresses;
    
    uint256 public lotteryCounter;
    mapping(uint256 => uint256) private requestToLotteryPlusOne;
    
    // Events
    event LotteryCreated(uint256 indexed lotteryId, address creator, string prizeDescription, uint256 deadline);
    event ParticipantEntered(uint256 indexed lotteryId, address participant);
    event WinnerDrawn(uint256 indexed lotteryId);
    event WinnerRevealed(uint256 indexed lotteryId, address winner);
    
    modifier lotteryExists(uint256 lotteryId) {
        require(lotteryId < lotteryCounter, "Lottery does not exist");
        _;
    }
    
    modifier onlyCreator(uint256 lotteryId) {
        require(lotteries[lotteryId].creator == msg.sender, "Only creator");
        _;
    }
    
    /**
     * @notice Creates a new lottery
     * @param _prizeDescription Text description of the prize
     * @param _deadline Timestamp when lottery entries close
     */
    function createLottery(string calldata _prizeDescription, uint256 _deadline) external {
        require(bytes(_prizeDescription).length > 0, "Prize description required");
        require(_deadline > block.timestamp, "Deadline must be in the future");
        
        uint256 lotteryId = lotteryCounter++;
        lotteries[lotteryId] = Lottery({
            creator: msg.sender,
            prizeDescription: _prizeDescription,
            deadline: _deadline,
            state: LotteryState.Open,
            encryptedParticipantCount: FHE.asEuint32(0),
            encryptedRandomSeed: FHE.asEuint32(0),
            winner: address(0),
            decryptedWinnerIndex: 0
        });
        
        emit LotteryCreated(lotteryId, msg.sender, _prizeDescription, _deadline);
    }
    
    /**
     * @notice Allows participants to enter a lottery
     * @param lotteryId ID of the lottery to enter
     * @param commitmentHash Hash of participant's commitment
     */
    function enterLottery(uint256 lotteryId, bytes32 commitmentHash) external lotteryExists(lotteryId) {
        Lottery storage lottery = lotteries[lotteryId];
        require(lottery.state == LotteryState.Open, "Lottery not open");
        require(block.timestamp < lottery.deadline, "Lottery deadline passed");
        
        // Initialize participant if not exists
        if (participants[lotteryId][msg.sender].commitmentHash == bytes32(0)) {
            participants[lotteryId][msg.sender] = Participant({
                commitmentHash: commitmentHash,
                isRevealed: false
            });
            
            // Add to address list for later reference
            participantAddresses[lotteryId].push(msg.sender);
            
            // Update encrypted participant count
            lottery.encryptedParticipantCount = FHE.add(lottery.encryptedParticipantCount, FHE.asEuint32(1));
            
            // Allow contract to decrypt this value in the future
            FHE.allowThis(lottery.encryptedParticipantCount);
            
            emit ParticipantEntered(lotteryId, msg.sender);
        }
    }
    
    /**
     * @notice Draws a winner for the lottery using FHE (only callable by creator)
     * @param lotteryId ID of the lottery to draw winner for
     * @param encryptedRandomSeed Encrypted random seed for winner selection
     */
    function drawWinner(uint256 lotteryId, euint32 encryptedRandomSeed) external lotteryExists(lotteryId) onlyCreator(lotteryId) {
        Lottery storage lottery = lotteries[lotteryId];
        require(lottery.state == LotteryState.Open, "Lottery not open");
        require(block.timestamp >= lottery.deadline, "Deadline not reached");
        
        // Store the encrypted random seed
        lottery.encryptedRandomSeed = encryptedRandomSeed;
        lottery.state = LotteryState.WinnerDrawn;
        FHE.allowThis(lottery.encryptedRandomSeed);
        
        emit WinnerDrawn(lotteryId);
    }
    
    /**
     * @notice Requests decryption of winner index
     * @param lotteryId ID of the lottery to decrypt
     */
    function requestWinnerDecryption(uint256 lotteryId) external lotteryExists(lotteryId) onlyCreator(lotteryId) {
        Lottery storage lottery = lotteries[lotteryId];
        require(lottery.state == LotteryState.WinnerDrawn, "Winner not drawn");
        
        // Prepare encrypted data for decryption
        bytes32[] memory ciphertexts = new bytes32[](2);
        ciphertexts[0] = FHE.toBytes32(lottery.encryptedRandomSeed);
        ciphertexts[1] = FHE.toBytes32(lottery.encryptedParticipantCount);
        
        // Request decryption
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptWinnerIndex.selector);
        requestToLotteryPlusOne[reqId] = lotteryId + 1;
    }
    
    /**
     * @notice Callback for decrypted winner index
     * @param requestId ID of the decryption request
     * @param cleartexts Decrypted values
     * @param proof Proof of decryption
     */
    function decryptWinnerIndex(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 stored = requestToLotteryPlusOne[requestId];
        require(stored != 0, "Invalid request");
        uint256 lotteryId = stored - 1;
        
        Lottery storage lottery = lotteries[lotteryId];
        require(lottery.state == LotteryState.WinnerDrawn, "Invalid state");
        
        // Verify decryption proof
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        // Process decrypted values
        uint32[] memory results = abi.decode(cleartexts, (uint32[]));
        uint32 randomSeed = results[0];
        uint32 participantCount = results[1];
        
        // Calculate winner index
        lottery.decryptedWinnerIndex = randomSeed % participantCount;
    }
    
    /**
     * @notice Allows winner to reveal their identity
     * @param lotteryId ID of the lottery to claim from
     * @param salt Secret salt used to generate the commitment
     */
    function revealWinner(uint256 lotteryId, bytes32 salt) external lotteryExists(lotteryId) {
        Lottery storage lottery = lotteries[lotteryId];
        require(lottery.state == LotteryState.WinnerDrawn, "Winner not drawn");
        require(lottery.decryptedWinnerIndex > 0, "Winner index not decrypted");
        
        // Get winner address from index
        require(participantAddresses[lotteryId].length > lottery.decryptedWinnerIndex, "Invalid winner index");
        address winnerAddress = participantAddresses[lotteryId][lottery.decryptedWinnerIndex];
        require(msg.sender == winnerAddress, "Not the winner");
        
        Participant storage participant = participants[lotteryId][msg.sender];
        require(!participant.isRevealed, "Already revealed");
        
        // Verify the commitment
        bytes32 computedCommitment = keccak256(abi.encodePacked(msg.sender, salt));
        require(
            participant.commitmentHash == computedCommitment,
            "Invalid commitment"
        );
        
        // Set the winner and mark as revealed
        lottery.winner = msg.sender;
        participant.isRevealed = true;
        lottery.state = LotteryState.Completed;
        
        emit WinnerRevealed(lotteryId, msg.sender);
    }
    
    /**
     * @notice Gets the number of participants in a lottery
     * @param lotteryId ID of the lottery
     * @return Number of participants
     */
    function getParticipantsCount(uint256 lotteryId) external view lotteryExists(lotteryId) returns (uint256) {
        return participantAddresses[lotteryId].length;
    }
    
    /**
     * @notice Gets the current state of a lottery
     * @param lotteryId ID of the lottery
     * @return Current state of the lottery
     */
    function getLotteryState(uint256 lotteryId) external view lotteryExists(lotteryId) returns (LotteryState) {
        return lotteries[lotteryId].state;
    }
    
    /**
     * @notice Gets the prize description for a lottery
     * @param lotteryId ID of the lottery
     * @return Prize description text
     */
    function getPrizeDescription(uint256 lotteryId) external view lotteryExists(lotteryId) returns (string memory) {
        return lotteries[lotteryId].prizeDescription;
    }
}