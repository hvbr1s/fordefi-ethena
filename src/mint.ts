import { Address, checksumAddress, createPublicClient, Hex, http } from "viem";
import "dotenv/config";
import {
  approve,
  bigIntAmount,
  createMintOrder,
  getAllowance,
  getRfq,
  signOrder,
  submitOrder,
  UINT256_MAX,
} from "./mint_utils";
import {
  OrderSending,
  OrderSigning,
  Rfq,
  SignatureType,
  Signature,
} from "./types";
import { ETHENA_MINTING_ABI } from "./minting_abi";
import { mainnet } from "viem/chains";
import { parseScientificOrNonScientificToBigInt } from "./parse_number";
import { Side } from "./types";
import { fordefiConfig, mintOrder } from './config'
import { setAllowance } from "./set-allowance";
import { getProvider } from './get-provider';
import {
  DOMAIN,
  ETHENA_URL,
  RPC_URL,
  MINT_ADDRESS,
  ORDER_TYPE,
} from "./constants";

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(RPC_URL)
});

async function main() {
  try {
    const provider = await getProvider();
    if (!provider) {
        throw new Error("Failed to initialize provider");
    }
    const signer = provider.getSigner();

    // Get RFQ
    const pair = `${mintOrder.collateralAsset}/USDe`;
    const rfqData = await getRfq(pair, "ALGO", mintOrder.side, mintOrder.amount, mintOrder.benefactor);

    console.log("RFQ", rfqData);

    // Create order
    const order = await createMintOrder(
      rfqData,
      mintOrder.benefactor,
      mintOrder.benefactor, // Using same address for beneficiary
      mintOrder.collateralAddresses[mintOrder.collateralAsset]
    );

    console.log("Order", order);

    const orderForSigning = {
      ...order,
      order_type: order.order_type === 'MINT' ? 0 : 1,
      expiry: BigInt(order.expiry),
      nonce: BigInt(order.nonce),
      collateral_amount: BigInt(order.collateral_amount),
      usde_amount: BigInt(order.usde_amount)
    };

    // Sign the properly formatted order
    const signature = await signer._signTypedData(
      DOMAIN,
      JSON.parse(JSON.stringify(ORDER_TYPE)),
      orderForSigning
    );

    console.log("Signature", signature);

    const isValidSignature = await publicClient.readContract({
      address: MINT_ADDRESS,
      abi: ETHENA_MINTING_ABI,
      functionName: "verifyOrder",
      args: [
        orderForSigning,
        {
          signature_type: Number(SignatureType.EIP712),
          signature_bytes: signature.startsWith('0x') ? signature as `0x${string}` : `0x${signature}`,
        },
      ],
    });

    console.log("isValidSignature", isValidSignature);

    const signatureObj: Signature = {
      signature_type: SignatureType.EIP712,
      signature_bytes: signature.startsWith('0x') ? signature as `0x${string}` : `0x${signature}`,
    };

    // Submit order
    const txHash = await submitOrder(order, signatureObj);
    console.log(`Transaction submitted: https://etherscan.io/tx/${txHash}`);
  } catch (error) {
    console.error(error);
  }
}

main();